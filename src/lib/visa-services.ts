export const VISA_SERVICE_OPTIONS = [
  { value: "STUDENT_VISA", label: "Student Visa" },
  { value: "TEMPORARY_RESIDENCE", label: "Temporary Residence (TR)" },
  { value: "SKILLS_ASSESSMENT", label: "Skills Assessment" },
  { value: "PERMANENT_RESIDENCE", label: "Permanent Residence (PR)" },
  { value: "VISITOR_VISA", label: "Visitor Visa" },
  { value: "TOURIST_VISA", label: "Tourist Visa" },
  { value: "OTHER", label: "Other Visa Services" },
] as const;

export type VisaServiceType = (typeof VISA_SERVICE_OPTIONS)[number]["value"];

export const ENGLISH_TEST_TYPES = ["IELTS", "PTE", "TOEFL"] as const;

export type EnglishTestType = (typeof ENGLISH_TEST_TYPES)[number];

/** Questionnaire / apply form fields shown only for student visa inquiries */
export const STUDENT_ONLY_QUESTION_IDS = new Set([
  "targetCourse",
  "preferredIntake",
  "currentEducationLevel",
  "englishTestScore",
  "englishTestType",
]);

export function isVisaServiceType(value: string): value is VisaServiceType {
  return VISA_SERVICE_OPTIONS.some((option) => option.value === value);
}

export function isStudentVisaService(value: string | null | undefined) {
  return value === "STUDENT_VISA";
}

export function getVisaServiceLabel(value: string | null | undefined) {
  if (!value) return "—";
  return VISA_SERVICE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function isEnglishTestType(value: string): value is EnglishTestType {
  return (ENGLISH_TEST_TYPES as readonly string[]).includes(value);
}

export function formatEnglishTestDisplay(
  type: string | null | undefined,
  score: string | null | undefined,
) {
  const trimmedScore = score?.trim();
  if (!trimmedScore) return null;
  const trimmedType = type?.trim();
  if (trimmedType && isEnglishTestType(trimmedType)) {
    return `${trimmedType} ${trimmedScore}`;
  }
  return trimmedScore;
}

/** Parse legacy combined values such as "IELTS 6.5" into type + score */
export function getVisaServiceFromAnswers(answers: unknown): string | null {
  if (!answers || typeof answers !== "object") return null;
  const raw = (answers as Record<string, unknown>).visaServiceType;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export function resolveVisaServiceType(
  profileValue?: string | null,
  answers?: unknown,
): string | null {
  return profileValue?.trim() || getVisaServiceFromAnswers(answers);
}

export function formatSubmissionServiceSummary(input: {
  intendedCourse?: string | null;
  answers?: unknown;
  profileVisaServiceType?: string | null;
}) {
  const serviceType = resolveVisaServiceType(input.profileVisaServiceType, input.answers);
  const serviceLabel = getVisaServiceLabel(serviceType);
  if (serviceType && isStudentVisaService(serviceType)) {
    const course = input.intendedCourse?.trim();
    return course ? `${serviceLabel} | ${course}` : serviceLabel;
  }
  if (serviceLabel !== "—") return serviceLabel;
  return input.intendedCourse?.trim() || "Service not specified";
}

export function parseLegacyEnglishTestScore(combined: string | null | undefined) {
  const raw = combined?.trim() ?? "";
  if (!raw) return { type: null as string | null, score: null as string | null };

  for (const testType of ENGLISH_TEST_TYPES) {
    const prefix = `${testType} `;
    if (raw.toUpperCase().startsWith(prefix)) {
      return {
        type: testType,
        score: raw.slice(prefix.length).trim() || null,
      };
    }
    if (raw.toUpperCase() === testType) {
      return { type: testType, score: null };
    }
  }

  return { type: null, score: raw };
}
