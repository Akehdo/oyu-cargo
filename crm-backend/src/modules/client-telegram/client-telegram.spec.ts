import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ConflictException } from "@nestjs/common";

import { ClientCodeSource, NotificationType } from "../../prisma/generated";
import { cannotInitiateChat, isChatGone } from "../../telegram/telegram-api";
import { signInitData, verifyInitData } from "../../telegram/telegram-init-data";
import {
  CLIENT_TERMS_VERSION,
  ClientAccountsService,
} from "../clients/client-accounts.service";
import { ClientTelegramBotService } from "./client-telegram-bot.service";
import {
  formatNotifications,
  groupByChat,
} from "./client-telegram-notifications.service";

const BOT_TOKEN = "123456:TEST-TOKEN";
const now = new Date("2026-11-19T10:00:00Z");
const authDate = String(Math.floor(now.getTime() / 1000) - 60);
const user = JSON.stringify({ id: 777000111, username: "aigerim" });

describe("Telegram Mini App initData", () => {
  it("accepts data signed with the bot token", () => {
    const initData = signInitData({ auth_date: authDate, query_id: "q1", user }, BOT_TOKEN);
    assert.deepEqual(verifyInitData(initData, BOT_TOKEN, now), {
      id: 777000111,
      username: "aigerim",
    });
  });

  it("rejects a forged user, another bot token and stale data", () => {
    const initData = signInitData({ auth_date: authDate, user }, BOT_TOKEN);
    const forged = initData.replace("777000111", "777000112");
    assert.equal(verifyInitData(forged, BOT_TOKEN, now), null);
    assert.equal(verifyInitData(initData, "999:OTHER", now), null);
    const later = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    assert.equal(verifyInitData(initData, BOT_TOKEN, later), null);
    assert.equal(verifyInitData("user=1", BOT_TOKEN, now), null);
  });
});

describe("Telegram notification messages", () => {
  it("groups one client's notifications into one message per chat", () => {
    const rows = [
      { id: "1", type: NotificationType.status_changed, title: "Посылка прибыла в Кокшетау — можно забирать", body: "TRACK-1 (кроссовки)", telegram_id: 5n },
      { id: "2", type: NotificationType.status_changed, title: "Посылка прибыла в Кокшетау — можно забирать", body: "TRACK-2", telegram_id: 5n },
      { id: "3", type: NotificationType.pickup_reminder, title: "Посылка давно ждёт выдачи", body: "TRACK-3 ждёт в ПВЗ", telegram_id: 5n },
      { id: "4", type: NotificationType.status_changed, title: "Посылка отправлена из Китая", body: "TRACK-4", telegram_id: 6n },
    ];
    const chats = groupByChat(rows);
    assert.deepEqual([...chats.keys()], [5n, 6n]);
    assert.equal(
      formatNotifications(chats.get(5n)!),
      "📦 Посылка прибыла в Кокшетау — можно забирать\n• TRACK-1 (кроссовки)\n• TRACK-2\n\n⏰ Посылка давно ждёт выдачи\n• TRACK-3 ждёт в ПВЗ",
    );
  });
});

describe("Telegram bot updates", () => {
  function botWith(consumed: unknown) {
    const sent: string[] = [];
    const service = new ClientTelegramBotService(
      {
        isEnabled: () => true,
        sendMessage: (_chat: unknown, text: string) => {
          sent.push(text);
          return Promise.resolve({ ok: true, result: {} });
        },
      } as never,
      {
        consumeLinkToken: () => Promise.resolve(consumed),
        findByTelegramId: () => Promise.resolve(null),
        unlinkTelegramId: () => Promise.resolve(),
      } as never,
      { get: (_key: string, fallback: string) => fallback } as never,
    );
    return { sent, service };
  }

  it("links the cabinet from /start <token> in a private chat", async () => {
    const { sent, service } = botWith({ id: "u1", profile: { code: 12345, name: "Айгерим" } });
    await service.handleUpdate({
      update_id: 1,
      message: { chat: { id: 9, type: "private" }, from: { id: 9 }, text: "/start abcdefghijklmnopqrstuv" },
    });
    assert.match(sent[0], /Telegram подключён к кабинету Айгерим, личный код 12345/);
  });

  it("ignores the staff group chat", async () => {
    const { sent, service } = botWith(null);
    await service.handleUpdate({
      update_id: 2,
      message: { chat: { id: -100, type: "supergroup" }, from: { id: 9 }, text: "/start" },
    });
    assert.equal(sent.length, 0);
  });

  it("rejects webhook calls without the configured secret", () => {
    const { service } = botWith(null);
    assert.equal(service.isValidWebhookSecret("anything"), false);
  });

  it("opens notification buttons on the cabinet page they are about", () => {
    const service = new ClientTelegramBotService(
      { isEnabled: () => true } as never,
      {} as never,
      {
        get: (key: string, fallback: string) =>
          key === "TELEGRAM_MINI_APP_URL" ? "https://cargo.example/" : fallback,
      } as never,
    );
    assert.deepEqual(service.cabinetKeyboard("Открыть посылки", "/tracks"), {
      inline_keyboard: [[{ text: "Открыть посылки", web_app: { url: "https://cargo.example/tracks" } }]],
    });
    assert.equal(service.cabinetKeyboard()?.inline_keyboard[0][0].text, "Открыть кабинет");
  });
});

describe("Telegram delivery errors", () => {
  it("unlinks blocked bots and deleted accounts, but keeps clients the bot may not write to yet", () => {
    const blocked = { ok: false as const, error_code: 403, description: "Forbidden: bot was blocked by the user" };
    const notStarted = { ok: false as const, error_code: 403, description: "Forbidden: bot can't initiate conversation with a user" };
    const missing = { ok: false as const, error_code: 400, description: "Bad Request: chat not found" };
    const flood = { ok: false as const, error_code: 429, description: "Too Many Requests" };
    assert.equal(isChatGone(blocked), true);
    assert.equal(isChatGone(missing), true);
    assert.equal(isChatGone(notStarted), false);
    assert.equal(cannotInitiateChat(notStarted), true);
    assert.equal(isChatGone(flood), false);
    assert.equal(isChatGone({ ok: true, result: {} }), false);
  });
});

describe("Registration with an existing personal code", () => {
  function accountsWith(options: { codeTaken: boolean; issuedTracks?: string[]; linked?: string[] }) {
    const created: { user?: Record<string, any>; links?: Record<string, any>[] } = {};
    const tx = {
      $executeRaw: () => Promise.resolve(0),
      clientTrack: {
        createMany: ({ data }: { data: Record<string, any>[] }) => {
          created.links = data;
          return Promise.resolve({ count: data.length });
        },
        findMany: () =>
          Promise.resolve((options.linked ?? []).map((trackNumber) => ({ trackNumber }))),
      },
      recordTrack: {
        findMany: () =>
          Promise.resolve((options.issuedTracks ?? []).map((trackNumber) => ({ trackNumber }))),
      },
      user: {
        create: ({ data }: { data: Record<string, any> }) => {
          created.user = data;
          return Promise.resolve({ id: "user-1", role: "user", sessionVersion: 0 });
        },
      },
    };
    const prisma = {
      $queryRaw: () => Promise.resolve([]),
      $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
      clientProfile: {
        findUnique: () => Promise.resolve(options.codeTaken ? { userId: "other" } : null),
      },
    };
    const auth = {
      issueTokens: () => Promise.resolve({ access_token: "a", refresh_token: "r" }),
    };
    const service = new ClientAccountsService(
      prisma as never,
      auth as never,
      { get: () => undefined } as never,
    );
    return { created, service };
  }

  const dto = {
    accept_terms: true,
    email: "old@example.com",
    name: "Старый клиент",
    password: "secret1",
    phone: "+77011234567",
    terms_version: CLIENT_TERMS_VERSION,
  };

  it("keeps the client's code and links the parcels issued to it before signup", async () => {
    const { created, service } = accountsWith({
      codeTaken: false,
      issuedTracks: ["OLD-1", "OLD-2"],
      linked: ["OLD-2"],
    });
    const result = await service.register({ ...dto, existing_code: 54321 });
    assert.equal(result.client_code, 54321);
    assert.equal(created.user?.clientProfile.create.code, 54321);
    assert.equal(created.user?.clientProfile.create.codeSource, ClientCodeSource.existing);
    assert.deepEqual(created.links?.map((link) => link.trackNumber), ["OLD-1"]);
    assert.ok(created.links?.every((link) => link.archivedAt && link.fromIssuance));
  });

  it("refuses a code that belongs to another account", async () => {
    const { service } = accountsWith({ codeTaken: true });
    await assert.rejects(
      service.register({ ...dto, existing_code: 54321 }),
      (error: unknown) =>
        error instanceof ConflictException &&
        (error.getResponse() as { error: { code: string } }).error.code === "CLIENT_CODE_TAKEN",
    );
  });

  it("still generates a code when none is given", async () => {
    const { created, service } = accountsWith({ codeTaken: false });
    // pickFreeCode checks the code is unused in profiles and old issuances.
    (service as unknown as { prisma: Record<string, any> }).prisma.record = {
      findFirst: () => Promise.resolve(null),
    };
    const result = await service.register(dto);
    assert.ok(result.client_code >= 10_000 && result.client_code <= 99_999);
    assert.equal(created.user?.clientProfile.create.codeSource, ClientCodeSource.generated);
  });
});
