import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { describe, it } from "node:test";
import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { JwtService } from "@nestjs/jwt";
import Redis from "ioredis";
import { UserRole } from "../../prisma/generated";
import { AuthService } from "./auth.service";
import { InvalidRefreshTokenException } from "./exceptions/invalid-refresh-token.exception";
import { AccessTokenGuard, ROLES_KEY } from "./guards/access-token.guard";
import { RefreshTokensService } from "./refresh-tokens.service";
import { TokenService } from "./token.service";

const config = new ConfigService({
  JWT_ACCESS_SECRET: "test-access",
  JWT_REFRESH_SECRET: "test-refresh",
});
const jwt = new JwtService({});
const tokens = new TokenService(config, jwt);

describe("password reset and token versions", () => {
  it("checks both legacy and newly issued access tokens against the stored version", async () => {
    const user = { id: randomUUID(), role: UserRole.user, sessionVersion: 0 };
    const guard = new AccessTokenGuard(tokens, new Reflector(), {
      user: { findUnique: async () => user },
    } as never);
    const handler = () => undefined;
    Reflect.defineMetadata(ROLES_KEY, [UserRole.user], handler);
    const check = (token: string) =>
      guard.canActivate({
        getHandler: () => handler,
        getClass: () => Object,
        switchToHttp: () => ({
          getRequest: () => ({ headers: { authorization: `Bearer ${token}` } }),
        }),
      } as never);
    const legacy = await jwt.signAsync(
      { role: user.role },
      { subject: user.id, secret: "test-access" },
    );
    const original = await tokens.generateAccessToken(user.id, user.role, 0);
    assert.equal(await check(legacy), true);
    assert.equal(await check(original), true);
    user.sessionVersion += 1;
    await assert.rejects(check(original), UnauthorizedException);
    await assert.rejects(check(legacy), UnauthorizedException);
    assert.equal(
      await check(await tokens.generateAccessToken(user.id, user.role, 1)),
      true,
    );
  });

  it("retains the old generation when a password reset overlaps an in-flight refresh", async () => {
    const user = { id: randomUUID(), role: UserRole.user, sessionVersion: 0 };
    const sessions = new Map<
      string,
      { userId: string; sessionVersion: number }
    >();
    sessions.set(tokens.hashRefreshToken("original"), {
      userId: user.id,
      sessionVersion: 0,
    });
    const store = {
      read: async (hash: string) => ({
        ...sessions.get(hash)!,
        raw: "version-0",
      }),
      rotate: async (
        oldHash: string,
        _raw: string,
        newHash: string,
        session: typeof user & { userId: string },
      ) => {
        user.sessionVersion++; // Password change committed after the refresh read.
        sessions.delete(oldHash);
        sessions.set(newHash, session);
      },
    };
    const auth = new AuthService(store as never, tokens, {
      findById: async () => ({ ...user }),
    } as never);
    const rotated = await auth.refresh("original");
    assert.notEqual(
      (await tokens.parseAccessToken(rotated.access_token)).sessionVersion,
      user.sessionVersion,
    );
    await assert.rejects(
      auth.refresh(rotated.refresh_token),
      InvalidRefreshTokenException,
    );
  });
});

it(
  "atomically rotates legacy Redis tokens and preserves the session generation",
  { skip: !process.env.TEST_REDIS_URL },
  async () => {
    const redis = new Redis(process.env.TEST_REDIS_URL!);
    try {
      const store = new RefreshTokensService({
        getClient: () => redis,
      } as never);
      const id = randomUUID(),
        hash = randomUUID();
      await redis.set(`auth:refresh:${hash}`, id, "EX", 60);
      const session = await store.read(hash);
      assert.equal(session.sessionVersion, 0);
      const candidates = [randomUUID(), randomUUID()];
      const attempts = await Promise.allSettled(
        candidates.map((next) =>
          store.rotate(hash, session.raw, next, session, 60),
        ),
      );
      assert.equal(
        attempts.filter((result) => result.status === "fulfilled").length,
        1,
      );
      const winner =
        candidates[
          attempts.findIndex((result) => result.status === "fulfilled")
        ];
      assert.equal((await store.read(winner)).userId, id);
      await store.delete(winner);
      await assert.rejects(store.read(winner), InvalidRefreshTokenException);
    } finally {
      await redis.quit();
    }
  },
);
