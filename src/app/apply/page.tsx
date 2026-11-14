import Link from "next/link";
import Image from "next/image";
import { after } from "next/server";
import { redirect } from "next/navigation";

import { prioritizedCountries } from "@/lib/countries";
import { isValidIntakeValue, resolveIntakeFromFormData } from "@/lib/intake-options";
import {
  isEducationLevel,
  isEnglishTestType,
  isHearFromOption,
  isOtherVisaService,
  isVisaServiceType,
  OTHER_SERVICE_DESCRIPTION_KEY,
  usesStudentClientFields,
} from "@/lib/visa-services";
import {
  buildApplicationAutoReplyEmail,
  buildApplicationInquiryEmail,
  getContactInboxEmail,
  sendGoogleWorkspaceEmail,
} from "@/lib/send-email";
import { SubmitButton } from "@/components/submit-button";
import { ApplyFormFields } from "./apply-form-fields";

type SearchParams = Promise<{ error?: string; success?: string }>;

export default async function ApplyPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;

  const errorMessage =
    searchParams.error === "validation"
      ? "Please fill all required fields correctly."
      : searchParams.error === "hearfrom-note"
        ? "Please add details in Additional notes when 'Others' is selected for where you heard from us."
        : searchParams.error === "server"
          ? "We could not send your inquiry right now. Please try again in a moment or email us directly."
          : null;

  const successMessage = searchParams.success
    ? "Thank you! Your inquiry has been submitted. Our team will contact you within 1–2 business days."
    : null;

  return (
    <main className="portal-theme min-h-screen py-10 text-slate-900">
      <div className="mx-auto max-w-3xl px-6">
        <div className="rounded-2xl border border-rose-200/40 bg-white/90 p-5 shadow-xl backdrop-blur-sm">
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center sm:h-12 sm:w-12">
              <Image
                src="/loogo.png"
                alt="L&B Global logo"
                width={48}
                height={48}
                className="h-11 w-11 rounded-md object-contain sm:h-12 sm:w-12"
                priority
              />
            </div>
            <div className="min-w-0 flex-1 px-1 text-center sm:px-2">
              <p className="text-[11px] uppercase tracking-[0.22em] text-blue-600">
                Overseas Education and Visa Services
              </p>
              <h1 className="mt-0.5 text-2xl font-semibold text-slate-900">
                Visa &amp; Immigration Inquiry
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Tell us which service you need and our team will contact you with next steps.
              </p>
              <p className="mt-2 text-sm font-medium text-blue-800">
                Takes about 2 minutes — we respond within 1–2 business days.
              </p>
            </div>
            <div className="flex h-11 w-11 shrink-0 items-center justify-center sm:h-12 sm:w-12">
              <Image
                src="/lucky7.png"
                alt="Lucky 7 logo"
                width={48}
                height={48}
                className="h-11 w-11 rounded-md object-contain sm:h-12 sm:w-12"
              />
            </div>
          </div>
          <div className="mt-4">
            <Link
              href="/"
              className="inline-flex rounded-full border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              Back to Homepage
            </Link>
          </div>
        </div>

        {errorMessage ? (
          <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 shadow-sm">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <div className="mt-6 rounded-2xl border border-emerald-200/60 bg-emerald-50/80 p-6 text-center shadow-sm">
            <p className="text-lg font-medium text-emerald-800">{successMessage}</p>
            <Link
              href="/"
              className="mt-4 inline-block rounded-full border border-emerald-400 px-5 py-2 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
            >
              Return to Homepage
            </Link>
          </div>
        ) : (
          <form
            action={submitInquiryAction}
            className="mt-6 space-y-5 rounded-2xl border border-rose-200/40 bg-white/90 p-6 text-slate-900 shadow-xl backdrop-blur-sm"
          >
            <ApplyFormFields prioritizedCountries={prioritizedCountries} />
            <SubmitButton
              loadingText="Submitting..."
              className="rounded-full bg-gradient-to-r from-rose-500 to-blue-500 px-5 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_rgba(244,63,94,0.28)] transition hover:scale-[1.02] disabled:opacity-70"
            >
              Submit inquiry
            </SubmitButton>
          </form>
        )}
      </div>
    </main>
  );
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasLength(value: string, min: number, max: number) {
  return value.length >= min && value.length <= max;
}

/**
 * Validates the enquiry and emails it to the L&B inbox. Nothing is stored:
 * the email is the only record, so a failed send is reported to the applicant.
 */
async function submitInquiryAction(formData: FormData) {
  "use server";

  const field = (name: string) => String(formData.get(name) ?? "").trim();

  // Honeypot: real people never see this field, bots fill it. Pretend success.
  if (field("company")) {
    redirect("/apply?success=1");
  }

  const fullName = field("fullName");
  const email = field("email").toLowerCase();
  const phone = field("phone");
  const city = field("city");
  const country = field("country");
  const visaServiceType = field("visaServiceType");
  const englishTestType = field("englishTestType");
  const englishTestScore = field("englishTestScore");
  const hearFrom = field("hearFrom");
  const additionalNote = field("additionalNote");

  const baseFieldsValid =
    hasLength(fullName, 2, 100) &&
    hasLength(email, 3, 200) &&
    EMAIL_REGEX.test(email) &&
    hasLength(phone, 1, 25) &&
    hasLength(city, 1, 100) &&
    (prioritizedCountries as readonly string[]).includes(country) &&
    isVisaServiceType(visaServiceType) &&
    isHearFromOption(hearFrom) &&
    additionalNote.length <= 5000 &&
    englishTestScore.length <= 50 &&
    (!englishTestScore || Boolean(englishTestType)) &&
    (!englishTestType || isEnglishTestType(englishTestType));

  if (!baseFieldsValid) {
    redirect("/apply?error=validation");
  }

  if (hearFrom === "Others" && !additionalNote) {
    redirect("/apply?error=hearfrom-note");
  }

  // Service-specific fields: only collect what the chosen service shows.
  let otherServiceDescription = "";
  let currentEducationLevel = "";
  let targetCourse = "";
  let preferredIntake = "";

  if (usesStudentClientFields(visaServiceType)) {
    currentEducationLevel = field("currentEducationLevel");
    targetCourse = field("targetCourse");
    preferredIntake = resolveIntakeFromFormData(formData, "preferredIntake");
    if (
      !isEducationLevel(currentEducationLevel) ||
      !hasLength(targetCourse, 1, 200) ||
      !isValidIntakeValue(preferredIntake)
    ) {
      redirect("/apply?error=validation");
    }
  } else if (isOtherVisaService(visaServiceType)) {
    otherServiceDescription = field(OTHER_SERVICE_DESCRIPTION_KEY);
    if (!hasLength(otherServiceDescription, 3, 500)) {
      redirect("/apply?error=validation");
    }
  }

  const inquiryResult = await sendGoogleWorkspaceEmail({
    to: getContactInboxEmail(),
    subject: `New visa inquiry: ${fullName}`,
    html: buildApplicationInquiryEmail({
      name: fullName,
      email,
      phone,
      city,
      country,
      visaServiceType,
      otherServiceDescription,
      currentEducationLevel,
      targetCourse,
      preferredIntake,
      englishTestType,
      englishTestScore,
      hearFrom,
      additionalNote,
    }),
    replyTo: email,
  });

  if (!inquiryResult.ok) {
    console.error("[apply] Inquiry email failed:", inquiryResult.error);
    redirect("/apply?error=server");
  }

  // The applicant's confirmation is a courtesy; don't hold up the response for it.
  after(async () => {
    const autoReply = await sendGoogleWorkspaceEmail({
      to: email,
      subject: "Inquiry Received – L&B Global",
      html: buildApplicationAutoReplyEmail({ name: fullName }),
    });
    if (!autoReply.ok) {
      console.warn("[apply] Inquiry sent but auto-reply failed:", autoReply.error);
    }
  });

  redirect("/apply?success=1");
}
