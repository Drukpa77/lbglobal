export const VISA_SERVICE_OPTIONS = [
  { value: "STUDENT_VISA", label: "Student Visa" },
  { value: "STUDENT_EXTENSION", label: "Student Extension" },
  { value: "SUBSEQUENT_VISA", label: "Subsequent Visa" },
  { value: "REAPPLICATION_COMBINED_VISA", label: "Reapplication/Combined Visa" },
  { value: "TGV_485_EXTENSION", label: "485 Temporary Graduate Visa Extension" },
  { value: "VISA_408", label: "408 Visa" },
  { value: "TEMPORARY_RESIDENCE", label: "Temporary Residence (TR)" },
  { value: "SKILLS_ASSESSMENT", label: "Skills Assessment" },
  { value: "PERMANENT_RESIDENCE", label: "Permanent Residence (PR)" },
  { value: "VISITOR_VISA", label: "Visitor Visa" },
  { value: "TOURIST_VISA", label: "Tourist Visa" },
  { value: "OTHER", label: "Other Services" },
] as const;

/** Visa services whose enquiry collects course / study-related fields */
const STUDENT_FIELD_SERVICE_TYPES = new Set<string>([
  "STUDENT_VISA",
  "STUDENT_EXTENSION",
]);

export type VisaServiceType = (typeof VISA_SERVICE_OPTIONS)[number]["value"];

export const OTHER_SERVICE_DESCRIPTION_KEY = "otherServiceDescription";

export const ENGLISH_TEST_TYPES = ["IELTS", "PTE", "TOEFL"] as const;

export type EnglishTestType = (typeof ENGLISH_TEST_TYPES)[number];

export const EDUCATION_LEVEL_OPTIONS = [
  "+2 / High School",
  "Diploma",
  "Bachelors",
  "Masters",
  "Other",
] as const;

export const HEAR_FROM_OPTIONS = [
  "Higher Perspective",
  "Google Search",
  "Facebook",
  "Instagram",
  "TikTok",
  "Friends/Family",
  "Existing Student",
  "Education Fair",
  "Others",
] as const;

export function isVisaServiceType(value: string): value is VisaServiceType {
  return VISA_SERVICE_OPTIONS.some((option) => option.value === value);
}

/**
 * Whether a visa service collects the student/course-related fields
 * (course, intake, education level). Covers Student Visa and Student Extension.
 */
export function usesStudentClientFields(value: string | null | undefined) {
  return value != null && STUDENT_FIELD_SERVICE_TYPES.has(value);
}

export function isOtherVisaService(value: string | null | undefined) {
  return value === "OTHER";
}

export function isEnglishTestType(value: string): value is EnglishTestType {
  return (ENGLISH_TEST_TYPES as readonly string[]).includes(value);
}

export function isEducationLevel(value: string) {
  return (EDUCATION_LEVEL_OPTIONS as readonly string[]).includes(value);
}

export function isHearFromOption(value: string) {
  return (HEAR_FROM_OPTIONS as readonly string[]).includes(value);
}

export function getVisaServiceLabel(value: string | null | undefined) {
  if (!value) return "—";
  return VISA_SERVICE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function formatEnglishTestDisplay(
  type: string | null | undefined,
  score: string | null | undefined,
) {
  const trimmedScore = score?.trim();
  const trimmedType = type?.trim();
  if (!trimmedScore) return trimmedType || null;
  if (trimmedType && isEnglishTestType(trimmedType)) {
    return `${trimmedType} ${trimmedScore}`;
  }
  return trimmedScore;
}

export function formatVisaServiceDisplay(input: {
  visaServiceType?: string | null;
  otherServiceDescription?: string | null;
}) {
  const serviceLabel = getVisaServiceLabel(input.visaServiceType?.trim());
  const otherDescription = input.otherServiceDescription?.trim();
  if (isOtherVisaService(input.visaServiceType) && otherDescription) {
    return `${serviceLabel} — ${otherDescription}`;
  }
  return serviceLabel;
}
