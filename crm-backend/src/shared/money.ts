type DecimalLike = {
  toNumber?: () => number;
  toString: () => string;
};

export type MoneyValue = number | string | DecimalLike;

/** Largest amount that fits DECIMAL(12, 2). */
export const MAX_MONEY = 9_999_999_999.99;

export function toMoneyNumber(value: MoneyValue): number {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string") {
    return Number(value);
  }

  if (typeof value.toNumber === "function") {
    return value.toNumber();
  }

  return Number(value.toString());
}

/** Money as integer tiyn, so sums and comparisons are exact. */
export function toCents(value: MoneyValue): number {
  return Math.round(toMoneyNumber(value) * 100);
}
