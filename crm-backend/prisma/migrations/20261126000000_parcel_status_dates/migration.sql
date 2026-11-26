-- When each delivery step was reached, for the client's progress bar.
-- A trigger keeps them on every status write (bulk updates, issuance,
-- undone issuance, raw SQL), so application code never sets them.
ALTER TABLE "parcels"
  ADD COLUMN "added_at" TIMESTAMP(3),
  ADD COLUMN "shipped_at" TIMESTAMP(3),
  ADD COLUMN "almaty_at" TIMESTAMP(3),
  ADD COLUMN "koksh_at" TIMESTAMP(3),
  ADD COLUMN "issued_at" TIMESTAMP(3);

-- Reaching a step keeps its first date (an undone issuance restores
-- "koksh" with the original arrival date); going back clears the later
-- steps, which did not happen. Skipped steps stay NULL.
CREATE OR REPLACE FUNCTION crm_parcel_status_dates() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  -- Stored like Prisma's DateTime: UTC in a column without a time zone.
  ts TIMESTAMP(3) := (now() AT TIME ZONE 'UTC');
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status < 'issued'::"ParcelStatus" THEN NEW.issued_at := NULL; END IF;
  IF NEW.status < 'koksh'::"ParcelStatus" THEN NEW.koksh_at := NULL; END IF;
  IF NEW.status < 'almaty'::"ParcelStatus" THEN NEW.almaty_at := NULL; END IF;
  IF NEW.status < 'shipped'::"ParcelStatus" THEN NEW.shipped_at := NULL; END IF;
  CASE NEW.status
    WHEN 'added' THEN NEW.added_at := COALESCE(NEW.added_at, ts);
    WHEN 'shipped' THEN NEW.shipped_at := COALESCE(NEW.shipped_at, ts);
    WHEN 'almaty' THEN NEW.almaty_at := COALESCE(NEW.almaty_at, ts);
    WHEN 'koksh' THEN NEW.koksh_at := COALESCE(NEW.koksh_at, ts);
    WHEN 'issued' THEN NEW.issued_at := COALESCE(NEW.issued_at, ts);
  END CASE;
  RETURN NEW;
END $$;

CREATE TRIGGER "parcels_status_dates"
  BEFORE INSERT OR UPDATE OF "status" ON "parcels"
  FOR EACH ROW EXECUTE FUNCTION crm_parcel_status_dates();

-- Existing parcels: the current step was reached at updated_at; a parcel
-- entered the China warehouse when it was created, unless the issuance
-- itself created it (record_tracks.previous_status IS NULL).
-- Intermediate dates were never stored and stay NULL.
UPDATE "parcels" p SET
  "added_at" = CASE
    WHEN p."status" = 'added' THEN p."updated_at"
    WHEN EXISTS (
      SELECT 1 FROM "record_tracks" rt
      WHERE rt."track_number" = p."track_number" AND rt."previous_status" IS NULL
    ) THEN NULL
    ELSE p."created_at"
  END,
  "shipped_at" = CASE WHEN p."status" = 'shipped' THEN p."updated_at" END,
  "almaty_at" = CASE WHEN p."status" = 'almaty' THEN p."updated_at" END,
  "koksh_at" = CASE WHEN p."status" = 'koksh' THEN p."updated_at" END,
  "issued_at" = CASE WHEN p."status" = 'issued' THEN p."updated_at" END;
