import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { ConflictException, ValidationPipe } from "@nestjs/common";
import { ParcelStatus, PaymentType } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import { RecordsService } from "../records/records.service";
import { ParcelsService } from "../parcels/parcels.service";
import { ClientEventsService } from "./client-events.service";
import {
  ClientAccountsService,
  CLIENT_TERMS_VERSION,
} from "./client-accounts.service";
import { ClientPortalService } from "./client-portal.service";
import { RegisterClientDto } from "./dto/client-auth.dto";

describe("registration terms", () => {
  const pipe = new ValidationPipe({
    transform: true,
    transformOptions: { enableImplicitConversion: true },
    whitelist: true,
  });
  const dto = {
    name: "Test Client",
    email: "client@example.com",
    phone: "+77011234567",
    password: "test-only",
    accept_terms: true,
    terms_version: CLIENT_TERMS_VERSION,
  };
  const validate = (accept_terms: unknown) =>
    pipe.transform(
      { ...dto, accept_terms },
      { type: "body", metatype: RegisterClientDto },
    );
  it("accepts only a JSON boolean consent", async () => {
    assert.equal((await validate(true)).accept_terms, true);
    for (const value of ["true", "false", false, 1, null])
      await assert.rejects(validate(value));
  });
  it("requires the displayed terms version before creating an account", async () => {
    const accounts = new ClientAccountsService(
      {} as never,
      {} as never,
      {} as never,
    );
    for (const version of [undefined, "old"]) {
      await assert.rejects(
        accounts.register({ ...dto, terms_version: version }),
        ConflictException,
      );
    }
  });
});

describe(
  "client ownership and pagination in PostgreSQL",
  { skip: !process.env.TEST_DATABASE_URL },
  () => {
    let db: PrismaService, portal: ClientPortalService, records: RecordsService;
    const prefix = randomUUID();
    const names = { a: 96351, b: 96352, list: 96353 };
    const ids = { a: randomUUID(), b: randomUUID(), list: randomUUID() };
    before(async () => {
      db = new PrismaService({
        get: () => process.env.TEST_DATABASE_URL,
      } as never);
      await db.$connect();
      portal = new ClientPortalService(db);
      records = new RecordsService(db);
      for (const key of ["a", "b", "list"] as const) {
        await db.user.create({
          data: {
            id: ids[key],
            passwordHash: "test-fixture",
            clientProfile: {
              create: {
                code: names[key],
                name: key,
                termsVersion: CLIENT_TERMS_VERSION,
                termsAcceptedAt: new Date(),
              },
            },
          },
        });
      }
    });
    after(async () => {
      if (db) {
        await db.user.deleteMany({ where: { id: { in: Object.values(ids) } } });
        await db.$disconnect();
      }
    });
    function issue(track: string) {
      return records.create({
        client_code: names.a,
        payment_type: PaymentType.cash,
        price: 100,
        weight: 1,
        track_numbers: [track],
      });
    }
    it("moves an issuance-created link to the corrected client and removes it when cancelled", async () => {
      const track = `${prefix}-AUTO`.toUpperCase();
      const record = await issue(track);
      const link = () =>
        db.clientTrack.findUnique({ where: { trackNumber: track } });
      assert.equal((await link())?.userId, ids.a);
      assert.equal((await link())?.fromIssuance, true);
      await records.update(record.id, { client_code: names.b });
      assert.equal((await link())?.userId, ids.b);
      await records.delete(record.id);
      assert.equal(await link(), null);
    });
    it("restores the client's pre-existing track to pending when cancelling an issuance-created parcel", async () => {
      const track = `${prefix}-MANUAL`;
      const added = await portal.addTrack(ids.a, track, "личная заметка");
      const record = await issue(track);
      assert.equal(
        (await portal.listTracks(ids.a, true)).items.some(
          (t) => t.id === added.id,
        ),
        true,
      );
      await records.delete(record.id);
      const active = (await portal.listTracks(ids.a, false)).items.find(
        (t) => t.id === added.id,
      );
      assert.equal(active?.status, "pending");
      assert.equal(active?.comment, "личная заметка");
      await portal.deleteTrack(ids.a, added.id);
    });
    it("requires staff confirmation to move a manually claimed track and withholds its old comment", async () => {
      const track = `${prefix}-CONFLICT`.toUpperCase();
      await portal.addTrack(ids.a, track, "private");
      const record = await issue(track);
      await assert.rejects(
        records.update(record.id, { client_code: names.b }),
        ConflictException,
      );
      assert.equal(
        (await db.record.findUniqueOrThrow({ where: { id: record.id } }))
          .clientCode,
        BigInt(names.a),
      );
      await records.update(record.id, {
        client_code: names.b,
        confirm_track_reassignment: true,
      });
      const assigned = await db.clientTrack.findUniqueOrThrow({
        where: { trackNumber: track },
      });
      assert.equal(assigned.userId, ids.b);
      assert.equal(assigned.comment, null);
      assert.equal(assigned.notifiedStatus, ParcelStatus.issued);
      await records.delete(record.id);
    });
    it("keeps the pickup deadline on repeat imports and sends one reminder to the current owner", async () => {
      const track = `${prefix}-REMINDER`.toUpperCase();
      const warehouse = new ParcelsService(db);
      const events = new ClientEventsService(db, {
        get: (_key: string, fallback: string) => fallback,
      } as never);
      await portal.addTrack(ids.a, track);
      await warehouse.upsertStatus([track], ParcelStatus.koksh);
      const now = new Date();
      const arrived = new Date(now.getTime() - 7 * 86_400_000);
      await db.parcel.update({
        where: { trackNumber: track },
        data: { updatedAt: arrived },
      });
      await warehouse.upsertStatus([track], ParcelStatus.koksh);
      await Promise.all([
        events.sendPickupReminders(now),
        events.sendPickupReminders(now),
      ]);
      const notices = await db.notification.findMany({
        where: { trackNumber: track, type: "pickup_reminder" },
      });
      assert.equal(notices.length, 1);
      assert.equal(notices[0].userId, ids.a);
      assert.match(notices[0].body, /7 дн\./);
    });

    it("paginates beyond 500 tracks without duplicates", async () => {
      await db.clientTrack.createMany({
        data: Array.from({ length: 501 }, (_, i) => ({
          userId: ids.list,
          trackNumber: `${prefix}-PAGE-${i}`.toUpperCase(),
        })),
      });
      const seen = new Set<string>();
      for (let page = 1; page <= 6; page++) {
        const result = await portal.listTracks(ids.list, false, page, 100);
        assert.equal(result.meta.total, 501);
        assert.equal(result.meta.total_pages, 6);
        for (const item of result.items) seen.add(item.id);
      }
      assert.equal(seen.size, 501);
    });
  },
);
