const russianKeys = "йцукенгшщзфывапролдячсмить";
const englishKeys = "qwertyuiopasdfghjklzxcvbnm";

/** Restore Latin letters typed or scanned with the Russian keyboard layout active. */
export function fixTrackKeyboardLayout(value: string): string {
  return value.replace(/[йцукенгшщзфывапролдячсмить]/gi, (character) => {
    const latin = englishKeys[russianKeys.indexOf(character.toLowerCase())];
    return character === character.toUpperCase() ? latin.toUpperCase() : latin;
  });
}

/** Normalize a track number before sending it to the API. */
export function normalizeTrackInput(value: string): string {
  return fixTrackKeyboardLayout(value).trim();
}
