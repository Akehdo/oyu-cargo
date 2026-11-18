BEGIN;

LOCK TABLE parcels, records, record_tracks, client_profiles, client_tracks, notifications IN SHARE ROW EXCLUSIVE MODE;

-- Match String.trim().toUpperCase() independently of the database's default locale.
CREATE FUNCTION crm_track_key(text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT upper(btrim($1, U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') COLLATE "und-x-icu")
$$;

-- The two parcel IDs can have different warehouse histories, and two account
-- bindings can have different owners/comments. Never choose a winner silently.
DO $$
DECLARE collision text;
BEGIN
  SELECT crm_track_key(track_number) INTO collision FROM parcels
    GROUP BY 1 HAVING count(*) > 1 ORDER BY 1 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Ambiguous parcel history for canonical track %. Reconcile its parcel rows before retrying.', collision;
  END IF;
  SELECT crm_track_key(track_number) INTO collision FROM client_tracks
    GROUP BY 1 HAVING count(*) > 1 ORDER BY 1 LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Ambiguous client bindings for canonical track %. Reconcile ownership and notes before retrying.', collision;
  END IF;
END $$;

CREATE FUNCTION crm_canonical_record_tracks(numbers jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT CASE WHEN jsonb_typeof(numbers) = 'array' THEN COALESCE((
    SELECT jsonb_agg(CASE WHEN jsonb_typeof(item) = 'string'
      THEN to_jsonb(crm_track_key(item #>> '{}')) ELSE item END ORDER BY ord)
    FROM jsonb_array_elements(numbers) WITH ORDINALITY elements(item, ord)
  ), '[]'::jsonb) ELSE numbers END
$$;

-- Build one ownership row per canonical track from every surviving receipt.
-- Keep all receipts, their track lists and payments, including duplicate receipts.
CREATE TEMP TABLE canonical_owners ON COMMIT DROP AS
SELECT DISTINCT ON (number) number, r.id AS record_id, r.client_code, r.created_at
FROM records r
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(r.track_numbers) = 'array'
  THEN r.track_numbers ELSE '[]'::jsonb END) items(item)
CROSS JOIN LATERAL (SELECT crm_track_key(item #>> '{}') AS number) n
WHERE jsonb_typeof(item) = 'string' AND number <> '' AND length(number) <= 255
ORDER BY number, r.created_at, r.id;

-- Unusual historical rows that do not correspond to a string track on any
-- surviving receipt need inspection before their ownership can be reconstructed.
DO $$
DECLARE orphan text;
        disputed record;
BEGIN
  SELECT rt.track_number INTO orphan FROM record_tracks rt WHERE NOT EXISTS (
    SELECT 1 FROM canonical_owners o WHERE o.number = crm_track_key(rt.track_number)
  ) LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Ownership row % has no matching receipt track. Reconcile it before retrying.', orphan;
  END IF;
  SELECT o.number, o.record_id, o.client_code AS receipt_code, p.code AS profile_code
    INTO disputed FROM canonical_owners o
    JOIN client_tracks t ON crm_track_key(t.track_number) = o.number
    LEFT JOIN client_profiles p ON p.user_id = t.user_id
    WHERE p.code IS DISTINCT FROM o.client_code
    ORDER BY o.number LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Disputed owner for track %: linked profile code %, receipt % has code %. Reconcile before retrying.',
      disputed.number, disputed.profile_code, disputed.record_id, disputed.receipt_code;
  END IF;
END $$;

UPDATE records SET track_numbers = crm_canonical_record_tracks(track_numbers)
  WHERE track_numbers <> crm_canonical_record_tracks(track_numbers);
UPDATE parcels SET track_number = crm_track_key(track_number) WHERE track_number <> crm_track_key(track_number);
UPDATE client_tracks SET track_number = crm_track_key(track_number) WHERE track_number <> crm_track_key(track_number);
UPDATE notifications SET track_number = crm_track_key(track_number) WHERE track_number <> crm_track_key(track_number);

CREATE TEMP TABLE canonical_previous ON COMMIT DROP AS
SELECT DISTINCT ON (crm_track_key(rt.track_number))
  crm_track_key(rt.track_number) AS number, rt.previous_status, rt.created_at
FROM record_tracks rt JOIN canonical_owners o ON o.number = crm_track_key(rt.track_number)
ORDER BY crm_track_key(rt.track_number), (rt.record_id = o.record_id) DESC,
         rt.created_at, rt.record_id, rt.track_number;
DELETE FROM record_tracks;
INSERT INTO record_tracks(track_number, record_id, previous_status, created_at)
SELECT o.number, o.record_id,
       CASE WHEN p.number IS NULL THEN 'koksh'::"ParcelStatus" ELSE p.previous_status END,
       COALESCE(p.created_at, o.created_at)
FROM canonical_owners o LEFT JOIN canonical_previous p USING (number);

-- Some historical receipts have no warehouse row. Recreate exactly those
-- parcels so the portal sees the issuance; cancellation will remove them.
WITH missing AS (
  UPDATE record_tracks rt SET previous_status = NULL
  WHERE NOT EXISTS (SELECT FROM parcels p WHERE p.track_number = rt.track_number)
  RETURNING rt.track_number, rt.created_at
)
INSERT INTO parcels(id, track_number, status, created_at, updated_at)
SELECT gen_random_uuid(), track_number, 'issued', created_at, created_at FROM missing;

-- A warehouse import could overwrite an issued parcel while its receipt survived.
UPDATE parcels p SET status = 'issued'
FROM canonical_owners o
WHERE p.track_number = o.number AND p.status <> 'issued';

UPDATE client_tracks t
SET archived_at = COALESCE(t.archived_at, o.created_at), notified_status = 'issued', reminder_sent_at = NULL
FROM canonical_owners o JOIN client_profiles profile ON profile.code = o.client_code
WHERE t.track_number = o.number AND t.user_id = profile.user_id
  AND (t.archived_at IS NULL OR t.notified_status IS DISTINCT FROM 'issued' OR t.reminder_sent_at IS NOT NULL);

-- A cancelled issuance could leave a customer's original tracking row in the
-- archive after its synthetic warehouse parcel was removed. Preserve the link
-- and its note, and make it an active, pending manual track again.
UPDATE client_tracks t
SET archived_at = NULL, notified_status = NULL, reminder_sent_at = NULL, from_issuance = false
WHERE t.archived_at IS NOT NULL
  AND NOT EXISTS (SELECT FROM parcels p WHERE p.track_number = t.track_number)
  AND NOT EXISTS (SELECT FROM canonical_owners o WHERE o.number = t.track_number);

ALTER TABLE records ADD CONSTRAINT records_canonical_tracks CHECK (track_numbers = crm_canonical_record_tracks(track_numbers));
ALTER TABLE parcels ADD CONSTRAINT parcels_canonical_track CHECK (track_number = crm_track_key(track_number));
ALTER TABLE record_tracks ADD CONSTRAINT record_tracks_canonical_track CHECK (track_number = crm_track_key(track_number));
ALTER TABLE client_tracks ADD CONSTRAINT client_tracks_canonical_track CHECK (track_number = crm_track_key(track_number));
CREATE INDEX records_track_numbers_gin ON records USING gin(track_numbers);

ALTER TABLE transactions ADD COLUMN transfer_key uuid;
CREATE UNIQUE INDEX transactions_transfer_key_direction_key ON transactions (transfer_key, transaction_type);
COMMIT;
