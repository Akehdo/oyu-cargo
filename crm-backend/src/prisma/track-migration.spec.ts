import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { it } from "node:test";
import { Client } from "pg";
import { normalizeTrackNumber } from "../shared/track-numbers";

const databaseUrl = process.env.TEST_DATABASE_URL;
const migration = "20261120010000_canonical_tracks_and_transfer_keys";

it(
  "migrates historical owners without changing financial entries and rejects ambiguous parcel histories atomically",
  { skip: !databaseUrl },
  async () => {
    const client = new Client({ connectionString: databaseUrl });
    const schema = "test_tracks_" + randomUUID().replaceAll("-", "");
    const folder = resolve("prisma/migrations");
    const sql = (name: string) =>
      readFile(resolve(folder, name, "migration.sql"), "utf8");
    await client.connect();
    try {
      await client.query(`CREATE SCHEMA "${schema}"`);
      await client.query(`SET search_path TO "${schema}", pg_catalog`);
      for (const name of (await readdir(folder)).sort()) {
        if (name < migration && /^\d/.test(name))
          await client.query(await sql(name));
      }
      const records = [randomUUID(), randomUUID()];
      const spellings = ["YtOld", "YTOLD"];
      for (const [i, id] of records.entries()) {
        await client.query(
          `INSERT INTO records
          (id,client_code,track_numbers,weight,price,payment_type,created_at,updated_at)
          VALUES ($1,10010,jsonb_build_array($2::text),1,100,'cash',$3,now())`,
          [id, spellings[i], `2025-01-0${i + 1}`],
        );
        await client.query(
          `INSERT INTO record_tracks(track_number,record_id,previous_status)
          VALUES ($1,$2,'koksh')`,
          [spellings[i], id],
        );
        await client.query(
          `INSERT INTO transactions(id,record_id,transaction_type,payment_type,amount,updated_at)
          VALUES ($1,$2,'INCOME','cash',100,now())`,
          [randomUUID(), id],
        );
      }
      const extraParcel = randomUUID();
      await client.query(
        `INSERT INTO parcels(id,track_number,status,updated_at)
        VALUES ($1,'YtOld','shipped',now()),($2,'YTOLD','koksh',now())`,
        [randomUUID(), extraParcel],
      );
      await assert.rejects(
        client.query(await sql(migration)),
        /Ambiguous parcel history/,
      );
      await client.query("ROLLBACK");
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM record_tracks"))
          .rows[0].count,
        2,
      );
      await client.query(
        "UPDATE parcels SET track_number='DISTINCT' WHERE id=$1",
        [extraParcel],
      );
      const clients = [randomUUID(), randomUUID()];
      for (const [i, userId] of clients.entries()) {
        await client.query(
          "INSERT INTO users(id,password_hash,role,updated_at) VALUES ($1,'fixture','user',now())",
          [userId],
        );
        await client.query(
          `INSERT INTO client_profiles(user_id,code,name,terms_version,terms_accepted_at,updated_at)
           VALUES ($1,$2,'Test customer','fixture',now(),now())`,
          [userId, 10011 + i],
        );
        await client.query(
          "INSERT INTO client_tracks(id,user_id,track_number,comment,updated_at) VALUES ($1,$2,$3,$4,now())",
          [randomUUID(), userId, spellings[i], "note" + i],
        );
      }
      await assert.rejects(
        client.query(await sql(migration)),
        /Ambiguous client bindings/,
      );
      await client.query("ROLLBACK");
      assert.deepEqual(
        (
          await client.query(
            "SELECT comment FROM client_tracks ORDER BY comment",
          )
        ).rows,
        [{ comment: "note0" }, { comment: "note1" }],
      );
      await client.query(
        "UPDATE client_tracks SET track_number='DISTINCT' WHERE user_id=$1",
        [clients[1]],
      );
      await client.query(
        "UPDATE client_tracks SET notified_status='shipped', reminder_sent_at=now() WHERE track_number='YtOld'",
      );
      const pendingId = randomUUID();
      await client.query(
        `INSERT INTO client_tracks(id,user_id,track_number,comment,archived_at,notified_status,
          reminder_sent_at,from_issuance,updated_at)
         VALUES ($1,$2,'Stale','private tracking note',now(),'issued',now(),true,now())`,
        [pendingId, clients[0]],
      );
      await assert.rejects(
        client.query(await sql(migration)),
        /Disputed owner for track YTOLD: linked profile code 10011, receipt .* has code 10010/,
      );
      await client.query("ROLLBACK");
      assert.deepEqual(
        (
          await client.query(
            "SELECT track_number,comment FROM client_tracks WHERE user_id=$1 AND track_number='YtOld'",
            [clients[0]],
          )
        ).rows,
        [{ track_number: "YtOld", comment: "note0" }],
      );
      assert.equal(
        (
          await client.query(
            "SELECT archived_at IS NOT NULL AS archived FROM client_tracks WHERE id=$1",
            [pendingId],
          )
        ).rows[0].archived,
        true,
      );
      // Simulate verifying the original pickup and correcting the receipt.
      await client.query("UPDATE records SET client_code=10011 WHERE id=$1", [
        records[0],
      ]);
      const missing = randomUUID();
      await client.query(
        `INSERT INTO records
        (id,client_code,track_numbers,weight,price,payment_type,updated_at)
        VALUES ($1,10012,'["missing"]',1,100,'cash',now())`,
        [missing],
      );
      await client.query(
        `INSERT INTO client_tracks(id,user_id,track_number,archived_at,notified_status,updated_at)
         VALUES ($1,$2,'missing','2025-03-12','shipped',now())`,
        [randomUUID(), clients[1]],
      );
      await client.query(await sql(migration));
      assert.deepEqual(
        (
          await client.query(
            `SELECT p.status,t.user_id,t.comment,t.notified_status,t.reminder_sent_at,
            (t.archived_at = r.created_at) AS archive_matches_receipt
           FROM parcels p JOIN record_tracks rt USING (track_number)
           JOIN records r ON r.id = rt.record_id JOIN client_tracks t ON t.track_number = p.track_number
           WHERE p.track_number = 'YTOLD'`,
          )
        ).rows,
        [
          {
            status: "issued",
            user_id: clients[0],
            comment: "note0",
            notified_status: "issued",
            reminder_sent_at: null,
            archive_matches_receipt: true,
          },
        ],
      );
      assert.deepEqual(
        (
          await client.query(
            `SELECT notified_status, (archived_at = TIMESTAMP '2025-03-12') AS original_date
           FROM client_tracks WHERE track_number = 'MISSING'`,
          )
        ).rows,
        [{ notified_status: "issued", original_date: true }],
      );
      assert.deepEqual(
        (
          await client.query(
            `SELECT p.status,t.archived_at FROM parcels p JOIN client_tracks t USING (track_number)
           WHERE p.track_number = 'DISTINCT'`,
          )
        ).rows,
        [{ status: "koksh", archived_at: null }],
      );
      assert.equal(
        (await client.query("SELECT count(*)::int AS count FROM notifications"))
          .rows[0].count,
        0,
      );
      assert.deepEqual(
        (
          await client.query(
            `SELECT id,user_id,track_number,comment,archived_at,notified_status,reminder_sent_at,from_issuance
         FROM client_tracks WHERE id=$1`,
            [pendingId],
          )
        ).rows,
        [
          {
            id: pendingId,
            user_id: clients[0],
            track_number: "STALE",
            comment: "private tracking note",
            archived_at: null,
            notified_status: null,
            reminder_sent_at: null,
            from_issuance: false,
          },
        ],
      );
      assert.deepEqual(
        (
          await client.query(
            "SELECT track_number,record_id,previous_status FROM record_tracks ORDER BY track_number",
          )
        ).rows,
        [
          {
            track_number: "MISSING",
            record_id: missing,
            previous_status: null,
          },
          {
            track_number: "YTOLD",
            record_id: records[0],
            previous_status: "koksh",
          },
        ],
      );
      assert.equal(
        (
          await client.query(
            "SELECT status FROM parcels WHERE track_number='MISSING'",
          )
        ).rows[0].status,
        "issued",
      );
      assert.deepEqual(
        (
          await client.query(
            "SELECT track_numbers FROM records ORDER BY created_at",
          )
        ).rows,
        [
          { track_numbers: ["YTOLD"] },
          { track_numbers: ["YTOLD"] },
          { track_numbers: ["MISSING"] },
        ],
      );
      assert.equal(
        (
          await client.query(
            "SELECT sum(amount)::int AS amount FROM transactions",
          )
        ).rows[0].amount,
        200,
      );
      for (const sample of [
        " yt-007 ",
        "\uFEFF\u2000ßı-σς\u00A0",
        "қызылорда",
        "ﬃ",
      ]) {
        const result = await client.query("SELECT crm_track_key($1) AS key", [
          sample,
        ]);
        assert.equal(result.rows[0].key, normalizeTrackNumber(sample));
      }
      await client.query(await sql("20261120020000_restore_track_check"));
      // pg_restore qualifies the table name and clears search_path before COPY.
      await client.query("SET search_path TO ''");
      const restoreReceipt = (tracks: unknown[]) =>
        client.query(
          `INSERT INTO "${schema}".records
           (id,client_code,track_numbers,weight,price,payment_type,updated_at)
           VALUES ($1,10011,$2::jsonb,1,100,'cash',now())`,
          [randomUUID(), JSON.stringify(tracks)],
        );
      assert.equal(
        (await restoreReceipt(["RESTORED", "ҚАЗ", 42, null])).rowCount,
        1,
      );
      await assert.rejects(restoreReceipt([" lower "]), {
        code: "23514",
        constraint: "records_canonical_tracks",
      });
    } finally {
      try {
        await client.query("ROLLBACK");
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      } finally {
        await client.end();
      }
    }
  },
);
