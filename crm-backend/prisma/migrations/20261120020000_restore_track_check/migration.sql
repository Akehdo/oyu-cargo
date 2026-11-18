-- Bind the helper in the function body at creation time. pg_restore sets an
-- empty search_path while COPY evaluates the receipt's check constraint.
CREATE OR REPLACE FUNCTION crm_canonical_record_tracks(numbers jsonb) RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
BEGIN ATOMIC
  SELECT CASE WHEN jsonb_typeof(numbers) = 'array' THEN COALESCE((
    SELECT jsonb_agg(CASE WHEN jsonb_typeof(item) = 'string'
      THEN to_jsonb(crm_track_key(item #>> '{}')) ELSE item END ORDER BY ord)
    FROM jsonb_array_elements(numbers) WITH ORDINALITY elements(item, ord)
  ), '[]'::jsonb) ELSE numbers END;
END;
