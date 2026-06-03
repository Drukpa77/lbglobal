import {
  formatVisaServiceDisplay,
  isEnglishTestType,
  isOtherVisaService,
  isStudentVisaService,
  isVisaServiceType,
  OTHER_SERVICE_DESCRIPTION_KEY,
} from "@/lib/visa-services";

export type ManualClientIntakeInput = {
  visaServiceType: string;
  visaServiceLabel: string;
  name: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  course: string;
  intake: string;
  currentEducation: string;
  englishTestType: string;
  englishTestScore: string;
  notes: string;
  otherServiceDescription: string;
  isStudentVisa: boolean;
  isOtherService: boolean;
};

export function parseManualClientIntakeFormData(
  formData: FormData,
): ManualClientIntakeInput | null {
  const visaServiceType = String(formData.get("visaServiceType") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const course = String(formData.get("course") ?? "").trim();
  const intake = String(formData.get("intake") ?? "").trim();
  const currentEducation = String(formData.get("currentEducation") ?? "").trim();
  const englishTestType = String(formData.get("englishTestType") ?? "").trim();
  const englishTestScore = String(formData.get("englishTestScore") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  const otherServiceDescription = String(
    formData.get(OTHER_SERVICE_DESCRIPTION_KEY) ?? "",
  ).trim();

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (
    !isVisaServiceType(visaServiceType) ||
    name.length < 2 ||
    name.length > 100 ||
    !emailRegex.test(email) ||
    !phone ||
    !country ||
    !city
  ) {
    return null;
  }

  const isStudentVisa = isStudentVisaService(visaServiceType);
  const isOtherService = isOtherVisaService(visaServiceType);
  if (isStudentVisa && (!course || !intake || !currentEducation)) {
    return null;
  }
  if (
    isOtherService &&
    (otherServiceDescription.length < 3 || otherServiceDescription.length > 500)
  ) {
    return null;
  }

  if (englishTestScore && (!englishTestType || !isEnglishTestType(englishTestType))) {
    return null;
  }

  if (englishTestType && !isEnglishTestType(englishTestType)) {
    return null;
  }

  return {
    visaServiceType,
    visaServiceLabel: formatVisaServiceDisplay({
      visaServiceType,
      otherServiceDescription,
    }),
    name,
    email,
    phone,
    country,
    city,
    course,
    intake,
    currentEducation,
    englishTestType,
    englishTestScore,
    notes,
    otherServiceDescription,
    isStudentVisa,
    isOtherService,
  };
}

export function buildManualIntakeAnswers(
  input: ManualClientIntakeInput,
  extras: { source: string },
) {
  return {
    fullName: input.name,
    email: input.email,
    phone: input.phone,
    country: input.country,
    city: input.city,
    visaServiceType: input.visaServiceType,
    [OTHER_SERVICE_DESCRIPTION_KEY]: input.isOtherService
      ? input.otherServiceDescription
      : "",
    currentEducationLevel: input.isStudentVisa ? input.currentEducation : "",
    targetCourse: input.isStudentVisa ? input.course : "",
    preferredIntake: input.isStudentVisa ? input.intake : "",
    englishTestType: input.englishTestType || "",
    englishTestScore: input.englishTestScore || "",
    additionalNote: input.notes,
    source: extras.source,
  };
}

export function buildManualIntakeProfileData(input: ManualClientIntakeInput) {
  return {
    phone: input.phone,
    city: input.city,
    nationality: input.country,
    visaServiceType: input.visaServiceType,
    otherServiceDescription: input.isOtherService ? input.otherServiceDescription : null,
    currentEducationLevel: input.isStudentVisa ? input.currentEducation : null,
    targetCourse: input.isStudentVisa ? input.course : null,
    preferredIntake: input.isStudentVisa ? input.intake : null,
    englishTestType: input.englishTestType || null,
    englishTestScore: input.englishTestScore || null,
    followUpNotes: input.notes || null,
  };
}
