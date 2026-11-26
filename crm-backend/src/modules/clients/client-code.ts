/** Personal client codes are 5-digit numbers, the same ones staff type into issuances. */
export const CLIENT_CODE_MIN = 10_000;
export const CLIENT_CODE_MAX = 99_999;

export function isClientCode(code: number): boolean {
  return Number.isInteger(code) && code >= CLIENT_CODE_MIN && code <= CLIENT_CODE_MAX;
}
