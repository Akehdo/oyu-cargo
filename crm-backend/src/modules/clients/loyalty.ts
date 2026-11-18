// Loyalty levels by issued kilograms. TODO(business): confirm thresholds and
// whether levels give discounts; today they are informational only.
const LEVELS = [
  { level: "start", label: "Старт", minWeightKg: 0 },
  { level: "bronze", label: "Бронза", minWeightKg: 20 },
  { level: "silver", label: "Серебро", minWeightKg: 50 },
  { level: "gold", label: "Золото", minWeightKg: 100 },
] as const;

export type LoyaltyLevel = (typeof LEVELS)[number]["level"];

export function loyaltyFor(issuedWeightKg: number) {
  let index = 0;
  for (let i = 0; i < LEVELS.length; i += 1) {
    if (issuedWeightKg >= LEVELS[i].minWeightKg) {
      index = i;
    }
  }

  const current = LEVELS[index];
  const next = LEVELS[index + 1];
  const progress = next
    ? ((issuedWeightKg - current.minWeightKg) /
        (next.minWeightKg - current.minWeightKg)) *
      100
    : 100;

  return {
    label: current.label,
    level: current.level as LoyaltyLevel,
    next_level_label: next?.label ?? null,
    next_level_weight_kg: next?.minWeightKg ?? null,
    progress_percent: Math.max(0, Math.min(100, Math.floor(progress))),
  };
}
