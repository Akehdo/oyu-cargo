const russianKeys = "йцукенгшщзфывапролдячсмить";
const englishKeys = "qwertyuiopasdfghjklzxcvbnm";

/** Restore Latin letters scanned with the Russian keyboard layout active. */
export function fixTrackKeyboardLayout(value: string): string {
  return value.replace(/[йцукенгшщзфывапролдячсмить]/gi, (character) => {
    const latin = englishKeys[russianKeys.indexOf(character.toLowerCase())];
    return character === character.toUpperCase() ? latin.toUpperCase() : latin;
  });
}
