/**
 * Unified platform index helpers.
 * Index = Total Platform Value ÷ Total Units Issued
 * Display = Base × (Current Index ÷ Starting Index)
 */

export const STARTING_INDEX = 10.0;

export function computeIndex(totalPlatformValue, totalUnitsIssued, startingIndex = STARTING_INDEX) {
  const units = Number(totalUnitsIssued) || 0;
  if (units <= 0) return Number(startingIndex);
  return round4(Number(totalPlatformValue) / units);
}

export function computeDisplayPrice(basePrice, currentIndex, startingIndex = STARTING_INDEX) {
  const start = Number(startingIndex) || STARTING_INDEX;
  if (start === 0) return round2(basePrice);
  return round2(Number(basePrice) * (Number(currentIndex) / start));
}

export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

export function round4(n) {
  return Math.round((Number(n) + Number.EPSILON) * 10000) / 10000;
}
