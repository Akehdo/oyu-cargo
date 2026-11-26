-- Clients who already had a personal code before the cabinet can keep it.
CREATE TYPE "ClientCodeSource" AS ENUM ('generated', 'existing');
ALTER TABLE "client_profiles"
  ADD COLUMN "code_source" "ClientCodeSource" NOT NULL DEFAULT 'generated';

-- Telegram link: the user id is also the private chat id with the bot.
ALTER TABLE "users"
  ADD COLUMN "telegram_id" BIGINT,
  ADD COLUMN "telegram_username" VARCHAR(64),
  ADD COLUMN "telegram_linked_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "users_telegram_id_key" ON "users"("telegram_id");

-- Telegram outbox for client notifications. Rows that existed before the
-- bot was connected are marked as sent so nobody gets an old backlog.
ALTER TABLE "notifications"
  ADD COLUMN "telegram_sent_at" TIMESTAMP(3),
  ADD COLUMN "telegram_attempts" INTEGER NOT NULL DEFAULT 0;
UPDATE "notifications" SET "telegram_sent_at" = "created_at";
CREATE INDEX "notifications_telegram_pending_idx"
  ON "notifications"("created_at") WHERE "telegram_sent_at" IS NULL;
