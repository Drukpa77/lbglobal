/** Standard Australian higher-education intake periods (month is 0-indexed). */
const INTAKE_PERIODS = [
  { month: 1, label: "Feb" },
  { month: 6, label: "Jul" },
  { month: 10, label: "Nov" },
] as const;

/**
 * Returns upcoming intake labels (e.g. "Jul 2026", "Nov 2026") from the current date forward.
 */
export function getUpcomingIntakeOptions(
  slotCount = 8,
  now: Date = new Date(),
): string[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  const options: string[] = [];

  for (let y = year; y <= year + 5 && options.length < slotCount; y++) {
    for (const period of INTAKE_PERIODS) {
      if (y === year && period.month < month) continue;
      options.push(`${period.label} ${y}`);
      if (options.length >= slotCount) return options;
    }
  }

  return options;
}

/**
 * Keeps a saved intake visible in dropdowns even if it is no longer in the rolling list.
 */
export function mergeIntakeOptions(
  options: string[],
  savedValue?: string | null,
): string[] {
  const trimmed = savedValue?.trim();
  if (!trimmed || options.includes(trimmed)) return options;
  return [trimmed, ...options];
}
