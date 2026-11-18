-- One row per issued track number: prevents issuing the same track twice and
-- remembers the parcel status to restore when an issuance is edited or deleted.
CREATE TABLE "record_tracks" (
    "track_number" VARCHAR(255) NOT NULL,
    "record_id" UUID NOT NULL,
    "previous_status" "ParcelStatus",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "record_tracks_pkey" PRIMARY KEY ("track_number")
);

CREATE INDEX "record_tracks_record_id_idx" ON "record_tracks"("record_id");

ALTER TABLE "record_tracks" ADD CONSTRAINT "record_tracks_record_id_fkey"
  FOREIGN KEY ("record_id") REFERENCES "records"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from existing issuances. When a track was issued more than once the
-- earliest issuance keeps it. The pre-issuance status is unknown for old data:
-- "koksh" (arrived at the pickup point) is what an edit or delete restores.
INSERT INTO "record_tracks" ("track_number", "record_id", "previous_status", "created_at")
SELECT DISTINCT ON (t.track_number)
       t.track_number, r.id, 'koksh'::"ParcelStatus", r.created_at
FROM "records" r
CROSS JOIN LATERAL jsonb_array_elements_text(
  CASE WHEN jsonb_typeof(r.track_numbers) = 'array' THEN r.track_numbers ELSE '[]'::jsonb END
) AS t(track_number)
WHERE length(btrim(t.track_number)) > 0 AND length(t.track_number) <= 255
ORDER BY t.track_number, r.created_at ASC, r.id ASC;
