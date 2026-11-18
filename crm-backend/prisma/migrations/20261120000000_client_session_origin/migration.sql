BEGIN;
ALTER TABLE "users" ADD COLUMN "session_version" INTEGER NOT NULL DEFAULT 0;
-- Older links have no reliable origin. Treat them as customer-added so that a
-- correction requires staff confirmation before moving them to another user.
ALTER TABLE "client_tracks" ADD COLUMN "from_issuance" BOOLEAN NOT NULL DEFAULT false;
COMMIT;
