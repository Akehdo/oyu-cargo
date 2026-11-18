import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import { UserRole } from "../../prisma/generated";
import { normalizePhone } from "../../shared/phone";
import { normalizeTrackNumbers } from "../../shared/track-numbers";
import { AccessTokenGuard, ROLES_KEY } from "../auth/guards/access-token.guard";
import { loyaltyFor } from "./loyalty";

describe("normalizePhone", () => {
  it("accepts common Kazakhstan formats", () => {
    for (const value of [
      "+7 701 123 45 67",
      "87011234567",
      "8 (701) 123-45-67",
      "77011234567",
      "7011234567",
    ]) {
      assert.equal(normalizePhone(value), "+77011234567", value);
    }
  });

  it("rejects numbers that are not Kazakhstan mobiles", () => {
    for (const value of [
      "",
      "12345",
      "+1 202 555 0100",
      "8 (501) 123-45-67",
      "+8 701 123 45 67",
      "client87011234567",
    ]) {
      assert.equal(normalizePhone(value), null, value);
    }
  });
});

describe("loyaltyFor", () => {
  it("returns the level and progress to the next one", () => {
    assert.deepEqual(loyaltyFor(0), {
      label: "Старт",
      level: "start",
      next_level_label: "Бронза",
      next_level_weight_kg: 20,
      progress_percent: 0,
    });
    assert.equal(loyaltyFor(35).level, "bronze");
    assert.equal(loyaltyFor(35).progress_percent, 50);
    const gold = loyaltyFor(250);
    assert.equal(gold.level, "gold");
    assert.equal(gold.next_level_label, null);
    assert.equal(gold.progress_percent, 100);
  });
});

describe("normalizeTrackNumbers", () => {
  it("trims, drops empty values and duplicates", () => {
    assert.deepEqual(normalizeTrackNumbers([" A1 ", "", "A1", "B2"]), [
      "A1",
      "B2",
    ]);
  });
});

describe("AccessTokenGuard roles", () => {
  const userId = "11111111-1111-4111-8111-111111111111";

  function contextFor(roles: UserRole[] | undefined) {
    const request: {
      headers: Record<string, string>;
      user?: unknown;
    } = { headers: { authorization: "Bearer token" } };
    const handler = () => undefined;
    class Controller {}
    if (roles) {
      Reflect.defineMetadata(ROLES_KEY, roles, handler);
    }
    return {
      context: {
        getClass: () => Controller,
        getHandler: () => handler,
        switchToHttp: () => ({ getRequest: () => request }),
      } as never,
      request,
    };
  }

  function guardFor(role: UserRole) {
    const tokens = {
      parseAccessToken: async () => ({ role, userId, sessionVersion: 0 }),
    };
    const prisma = {
      user: { findUnique: async () => ({ role, sessionVersion: 0 }) },
    };
    return new AccessTokenGuard(
      tokens as never,
      new Reflector(),
      prisma as never,
    );
  }

  it("lets an admin into admin routes", async () => {
    const { context, request } = contextFor([UserRole.admin]);
    assert.equal(await guardFor(UserRole.admin).canActivate(context), true);
    assert.deepEqual(request.user, { role: UserRole.admin, userId });
  });

  it("keeps clients out of CRM routes and staff out of the portal", async () => {
    await assert.rejects(
      guardFor(UserRole.user).canActivate(contextFor([UserRole.admin]).context),
      ForbiddenException,
    );
    await assert.rejects(
      guardFor(UserRole.admin).canActivate(contextFor([UserRole.user]).context),
      ForbiddenException,
    );
  });

  it("denies routes that declare no roles", async () => {
    await assert.rejects(
      guardFor(UserRole.admin).canActivate(contextFor(undefined).context),
      ForbiddenException,
    );
  });

  it("rejects an invalid token", async () => {
    const tokens = {
      parseAccessToken: async () => {
        throw new Error("bad");
      },
    };
    const guard = new AccessTokenGuard(
      tokens as never,
      new Reflector(),
      {} as never,
    );
    await assert.rejects(
      guard.canActivate(contextFor([UserRole.admin]).context),
      UnauthorizedException,
    );
  });
});
