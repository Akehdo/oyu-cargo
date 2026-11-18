import { Prisma } from "../prisma/generated";

export function normalizeTrackNumber(value: string): string {
  return value.trim().toUpperCase();
}

export function normalizeTrackNumbers(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const trackNumber = normalizeTrackNumber(value);
    if (!trackNumber || seen.has(trackNumber)) {
      continue;
    }

    seen.add(trackNumber);
    result.push(trackNumber);
  }

  return result;
}

/** Lock even a track that has no parcel or issuance row yet. All writers acquire
 * the same sorted set of keys before reading ownership or modifying a parcel. */
export async function lockTrackNumbers(
  tx: Prisma.TransactionClient,
  values: readonly string[],
): Promise<void> {
  const tracks = normalizeTrackNumbers(values);
  if (tracks.length) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(lock_key)
      FROM (SELECT DISTINCT hashtextextended(track, 53194) AS lock_key
            FROM unnest(ARRAY[${Prisma.join(tracks)}]::text[]) AS numbers(track)
            ORDER BY lock_key) AS ordered_keys`;
  }
}

/** Read the JSONB track_numbers column of a record as a string list. */
export function trackNumbersFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}
