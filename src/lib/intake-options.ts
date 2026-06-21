/** All calendar months (month is 0-indexed). */
const INTAKE_MONTHS = [
  { month: 0, label: "Jan" },
  { month: 1, label: "Feb" },
  { month: 2, label: "Mar" },
  { month: 3, label: "Apr" },
  { month: 4, label: "May" },
  { month: 5, label: "Jun" },
  { month: 6, label: "Jul" },
  { month: 7, label: "Aug" },
  { month: 8, label: "Sep" },
  { month: 9, label: "Oct" },
  { month: 10, label: "Nov" },
  { month: 11, label: "Dec" },
] as const;

/** Select value that reveals the free-text custom intake field. */
export const INTAKE_OTHER_VALUE = "__intake_other__";

export const INTAKE_CUSTOM_MIN_LENGTH = 2;
export const INTAKE_CUSTOM_MAX_LENGTH = 100;

/**
 * Returns upcoming intake labels (e.g. "Jul 2026", "Aug 2026") from the current date forward.
 */
export function getUpcomingIntakeOptions(
  slotCount = 24,
  now: Date = new Date(),
): string[] {
  const year = now.getFullYear();
  const month = now.getMonth();
  const options: string[] = [];

  for (let y = year; y <= year + 5 && options.length < slotCount; y++) {
    for (const period of INTAKE_MONTHS) {
      if (y === year && period.month < month) continue;
      options.push(`${period.label} ${y}`);
      if (options.length >= slotCount) return options;
    }
  }

  return options;
}

/**
 * Returns all 12 months for each year in the editable range (includes past months).
 * Used on staff profile forms where historical intakes may need correction.
 */
export function getEditableIntakeOptions(
  now: Date = new Date(),
  yearSpan = 4,
): string[] {
  const startYear = now.getFullYear() - 1;
  const options: string[] = [];

  for (let y = startYear; y < startYear + yearSpan; y++) {
    for (const period of INTAKE_MONTHS) {
      options.push(`${period.label} ${y}`);
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

export function getIntakeCustomFieldName(fieldName: string): string {
  return `${fieldName}Custom`;
}

export function resolveIntakeSelection(
  selectValue: string,
  customValue: string,
): string {
  const trimmedSelect = selectValue.trim();
  const trimmedCustom = customValue.trim();
  if (trimmedSelect === INTAKE_OTHER_VALUE) {
    return trimmedCustom;
  }
  return trimmedSelect;
}

export function resolveIntakeFromFormData(
  formData: FormData,
  fieldName: string,
): string {
  const selectValue = String(formData.get(fieldName) ?? "").trim();
  const customValue = String(
    formData.get(getIntakeCustomFieldName(fieldName)) ?? "",
  ).trim();
  return resolveIntakeSelection(selectValue, customValue);
}

export function isValidIntakeValue(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length >= INTAKE_CUSTOM_MIN_LENGTH &&
    trimmed.length <= INTAKE_CUSTOM_MAX_LENGTH
  );
}

export function getIntakeFieldState(
  savedValue?: string | null,
  options?: string[],
): { selectValue: string; customValue: string } {
  const trimmed = savedValue?.trim() ?? "";
  if (!trimmed) {
    return { selectValue: "", customValue: "" };
  }

  const intakeOptions = options ?? getUpcomingIntakeOptions();
  if (intakeOptions.includes(trimmed)) {
    return { selectValue: trimmed, customValue: "" };
  }

  return { selectValue: INTAKE_OTHER_VALUE, customValue: trimmed };
}
