/** Accept either decimal separator without changing the text being edited. */
export function parseDecimalInput(value: string): number {
  const normalized = value.trim().replace(/,/g, ".");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
    return NaN;
  }

  return Number(normalized);
}
