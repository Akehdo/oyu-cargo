import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import {
  BadRequestException,
  ConflictException,
  UnauthorizedException,
  ValidationPipe,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import bcrypt from "bcryptjs";

import { User, UserRole } from "../../prisma/generated";
import { PrismaService } from "../../prisma/prisma.service";
import {
  CLIENT_TERMS_VERSION,
  ClientAccountsService,
} from "../clients/client-accounts.service";
import { ClientAuthController } from "../clients/clients.controllers";
import { RegisterClientDto } from "../clients/dto/client-auth.dto";
import { UsersService } from "../users/users.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";

const password = "test-portal-password";
const pipe = new ValidationPipe({
  transform: true,
  transformOptions: { enableImplicitConversion: true },
  whitelist: true,
});

function registration(email: string, phone: string) {
  return {
    name: "Portal Login Test",
    email,
    phone,
    password,
    accept_terms: true,
    terms_version: CLIENT_TERMS_VERSION,
  };
}

function validateRegistration(dto: object): Promise<RegisterClientDto> {
  return pipe.transform(dto, { type: "body", metatype: RegisterClientDto });
}

function authWith(users: Pick<UsersService, "findByEmail" | "findByPhone">) {
  const auth = new AuthService({} as never, {} as never, users as UsersService);
  auth.issueTokens = async (user) => ({
    access_token: user.id,
    refresh_token: user.role,
  });
  return auth;
}

async function signIn(controller: AuthController, body: object) {
  const dto: LoginDto = await pipe.transform(body, {
    type: "body",
    metatype: LoginDto,
  });
  return controller.login(dto);
}

describe("public login and registration contracts", () => {
  it("requires exactly one nonempty string identifier", async () => {
    const controller = new AuthController({} as never);
    for (const body of [
      {},
      { email: "admin@example.com", login: "client@example.com" },
      { login: null },
      { login: "  " },
      { login: 77011234567 },
      { email: null },
      { email: "" },
    ]) {
      await assert.rejects(
        signIn(controller, { ...body, password }),
        BadRequestException,
      );
    }
  });

  it("requires an email and a phone when registering", async () => {
    const dto = registration("portal@example.com", "+77011234567");
    await validateRegistration(dto);
    for (const change of [
      { email: undefined },
      { email: "" },
      { email: "invalid" },
      { phone: undefined },
      { phone: "" },
    ]) {
      await assert.rejects(
        validateRegistration({ ...dto, ...change }),
        BadRequestException,
      );
    }
  });

  it("preserves the role and legacy route restrictions for both login identifiers", async () => {
    const passwordHash = await bcrypt.hash(password, 4);
    const base = {
      passwordHash,
      createdAt: new Date(),
      updatedAt: new Date(),
      sessionVersion: 0,
    };
    const admin = {
      ...base,
      id: randomUUID(),
      email: "admin@example.com",
      phone: "+77011234560",
      role: UserRole.admin,
    };
    const client = {
      ...base,
      id: randomUUID(),
      email: "client@example.com",
      phone: "+77011234561",
      role: UserRole.user,
    };
    const legacy = {
      ...client,
      id: randomUUID(),
      email: null,
      phone: "+77011234562",
    };
    const users: User[] = [admin, client, legacy];
    const auth = authWith({
      findByEmail: async (email) =>
        users.find((user) => user.email === email.toLowerCase()) ?? null,
      findByPhone: async (phone) =>
        users.find((user) => user.phone === phone) ?? null,
    });
    const controller = new AuthController(auth);
    const oldPortal = new ClientAuthController({} as never, auth);

    for (const [login, user] of [
      [admin.email, admin],
      [client.email.toUpperCase(), client],
      ["8 (701) 123-45-61", client],
      [legacy.phone, legacy],
    ] as const) {
      assert.deepEqual(await signIn(controller, { login, password }), {
        access_token: user.id,
        refresh_token: user.role,
      });
    }
    assert.equal(
      (await signIn(controller, { email: admin.email, password })).access_token,
      admin.id,
    );
    assert.equal(
      (await oldPortal.login({ phone: legacy.phone, password })).access_token,
      legacy.id,
    );
    for (const body of [
      { email: client.email, password },
      { login: admin.phone, password },
      { login: client.email, password: "incorrect" },
      { login: "missing@example.com", password },
    ]) {
      await assert.rejects(signIn(controller, body), UnauthorizedException);
    }
    await assert.rejects(
      oldPortal.login({ phone: admin.phone, password }),
      UnauthorizedException,
    );
  });
});

describe(
  "portal account contacts in PostgreSQL",
  { skip: !process.env.TEST_DATABASE_URL },
  () => {
    const domain = `@${randomUUID()}.example.com`;
    const reservedEmail = `SeedOwner${domain}`;
    let suffix = randomInt(1_000_000, 9_900_000);
    const nextPhone = () => `+7701${suffix++}`;
    let db: PrismaService;
    let accounts: ClientAccountsService;
    let controller: AuthController;

    before(async () => {
      db = new PrismaService({
        get: () => process.env.TEST_DATABASE_URL,
      } as never);
      await db.$connect();
      const auth = authWith(new UsersService(db));
      accounts = new ClientAccountsService(
        db,
        auth,
        new ConfigService({ SEED_ADMIN_EMAIL: reservedEmail }),
      );
      controller = new AuthController(auth);
    });

    after(async () => {
      if (db) {
        try {
          await db.user.deleteMany({
            where: { email: { endsWith: domain, mode: "insensitive" } },
          });
        } finally {
          await db.$disconnect();
        }
      }
    });

    async function register(email: string, phone = nextPhone()) {
      return accounts.register(
        await validateRegistration(registration(email, phone)),
      );
    }

    function contactConflict(error: unknown) {
      assert.ok(error instanceof ConflictException);
      assert.equal(error.getStatus(), 409);
      const response = error.getResponse();
      assert.ok(typeof response === "object" && "error" in response);
      assert.ok(
        response.error &&
          typeof response.error === "object" &&
          "code" in response.error,
      );
      assert.equal(response.error.code, "CONTACT_ALREADY_REGISTERED");
      return response;
    }

    it("stores normalized contacts, matches historical email casing and treats % and _ literally", async () => {
      const decoy = `PortalXFullValue${domain}`;
      const literal = `Portal_%Value${domain}`;
      const existing = await db.user.create({
        data: {
          email: decoy,
          passwordHash: await bcrypt.hash(password, 4),
          role: UserRole.admin,
        },
      });
      assert.equal(
        (await signIn(controller, { login: decoy.toLowerCase(), password }))
          .access_token,
        existing.id,
      );
      for (const local of [
        "Portal_FullValue",
        "Portal%Value",
        "Portal_%Value",
      ]) {
        await assert.rejects(
          signIn(controller, { login: `${local}${domain}`, password }),
          UnauthorizedException,
        );
      }
      const phone = nextPhone();
      const result = await register(literal, `8 (701) ${phone.slice(5)}`);
      const user = await db.user.findUniqueOrThrow({
        where: { id: result.access_token },
      });
      assert.equal(user.email, literal.toLowerCase());
      assert.equal(user.phone, phone);
      assert.equal(user.role, UserRole.user);
      assert.equal(
        (await signIn(controller, { login: literal.toUpperCase(), password }))
          .access_token,
        user.id,
      );
      assert.equal(
        (await signIn(controller, { login: phone, password })).access_token,
        user.id,
      );
    });

    it("returns the same public conflict for an occupied phone, client email or historical admin email", async () => {
      const phone = nextPhone();
      const email = `taken${domain}`;
      const adminEmail = `OldAdmin${domain}`;
      await register(email, phone);
      await db.user.create({
        data: {
          email: adminEmail,
          passwordHash: "unused",
          role: UserRole.admin,
        },
      });
      const errors: object[] = [];
      for (const [candidate, candidatePhone] of [
        [`other${domain}`, phone],
        [email.toUpperCase(), nextPhone()],
        [adminEmail.toLowerCase(), nextPhone()],
      ]) {
        await assert.rejects(register(candidate, candidatePhone), (error) => {
          errors.push(contactConflict(error));
          return true;
        });
      }
      assert.deepEqual(errors[0], errors[1]);
      assert.deepEqual(errors[0], errors[2]);
    });

    it("reserves the configured seed admin email before the admin exists", async () => {
      const email = reservedEmail.toLowerCase();
      assert.equal(await db.user.count({ where: { email } }), 0);
      await assert.rejects(register(email), (error) => {
        contactConflict(error);
        return true;
      });
      assert.equal(await db.user.count({ where: { email } }), 0);
    });

    for (const shared of ["email", "phone"] as const) {
      it(`creates a single account when concurrent registrations share a ${shared}`, async () => {
        const email = `race-${shared}${domain}`;
        const phone = nextPhone();
        const emails = [
          email,
          shared === "email" ? email.toUpperCase() : `race-other${domain}`,
        ];
        const results = await Promise.allSettled([
          register(emails[0], phone),
          register(emails[1], shared === "phone" ? phone : nextPhone()),
        ]);
        assert.equal(
          results.filter((result) => result.status === "fulfilled").length,
          1,
        );
        const failure = results.find((result) => result.status === "rejected");
        assert.ok(failure && failure.status === "rejected");
        contactConflict(failure.reason);
        assert.equal(
          await db.user.count({
            where: {
              email: { in: emails.map((email) => email.toLowerCase()) },
            },
          }),
          1,
        );
      });
    }
  },
);
