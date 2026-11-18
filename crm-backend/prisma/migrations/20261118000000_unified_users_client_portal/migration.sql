-- Unified users: role admin = CRM staff, role user = cargo client.
CREATE TYPE "UserRole" AS ENUM ('admin', 'user');

-- Every user that existed before this migration is CRM staff.
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "UserRole" USING 'admin'::"UserRole";
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'user';

ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "users" ADD COLUMN "phone" VARCHAR(20);
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
CREATE INDEX "users_role_idx" ON "users"("role");

CREATE TABLE "client_profiles" (
    "user_id" UUID NOT NULL,
    "code" INTEGER NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "terms_version" VARCHAR(20) NOT NULL,
    "terms_accepted_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("user_id")
);
CREATE UNIQUE INDEX "client_profiles_code_key" ON "client_profiles"("code");
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "client_tracks" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "track_number" VARCHAR(255) NOT NULL,
    "comment" VARCHAR(100),
    "archived_at" TIMESTAMP(3),
    "notified_status" "ParcelStatus",
    "reminder_sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_tracks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "client_tracks_track_number_key" ON "client_tracks"("track_number");
CREATE INDEX "client_tracks_user_id_archived_at_idx" ON "client_tracks"("user_id", "archived_at");
ALTER TABLE "client_tracks" ADD CONSTRAINT "client_tracks_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "NotificationType" AS ENUM ('status_changed', 'pickup_reminder');

CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "track_number" VARCHAR(255),
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "records_client_code_idx" ON "records"("client_code");
