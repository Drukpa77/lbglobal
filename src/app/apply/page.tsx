import Link from "next/link";
import Image from "next/image";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { prioritizedCountries } from "@/lib/countries";
import { generateNextCaseReference } from "@/lib/case-reference";
import { parseTemplateQuestions } from "@/lib/questionnaire";
import { prisma } from "@/lib/prisma";
import { queueDevEmail } from "@/lib/email-outbox";
import {
  buildApplicationInquiryEmail,
  getContactInboxEmail,
  sendGoogleWorkspaceEmail,
} from "@/lib/send-email";
import { notifyStaffOfNewApplication } from "@/lib/workflow-notifications";
import { SubmitButton } from "@/components/submit-button";
import { ApplyFormFields } from "./apply-form-fields";

const HEAR_FROM_OPTIONS = [
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

const NOTE_IDS = [
  "additionalNote",
  "additionalNotes",
  "note",
  "notes",
  "comment",
  "comments",
] as const;

type SearchParams = Promise<{ error?: string; success?: string }>;

export default async function ApplyPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const template = await prisma.questionnaireTemplate.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, questions: true },
  });

  const questions = template
    ? parseTemplateQuestions(template.questions)
    : [];

  // Ensure key fields exist and place hearFrom + additional note at the bottom.
  const questionIds = new Set(questions.map((q) => q.id));
  const baseRequiredQuestions = [
    { id: "fullName", label: "Full name", type: "text" as const, required: true, placeholder: "Enter your full name" },
    { id: "email", label: "Email", type: "text" as const, required: true, placeholder: "you@example.com" },
  ];

  const existingHearFrom = questions.find((q) => q.id === "hearFrom");
  const existingAdditionalNote = questions.find((q) => NOTE_IDS.includes(q.id as (typeof NOTE_IDS)[number]));

  const hearFromQuestion = {
    id: "hearFrom",
    label: existingHearFrom?.label ?? "Where did you hear from us?",
    type: "select" as const,
    required: existingHearFrom?.required ?? true,
    options: [...HEAR_FROM_OPTIONS],
    placeholder: existingHearFrom?.placeholder,
  };

  const additionalNoteQuestion =
    existingAdditionalNote ??
    {
      id: "additionalNote",
      label: "Additional note",
      type: "textarea" as const,
      required: false,
      placeholder: "If you selected Other above, please mention exactly where you heard about us.",
    };

  const merged = [
    ...baseRequiredQuestions.filter((q) => !questionIds.has(q.id)),
    ...questions.filter(
      (q) => q.id !== "hearFrom" && !NOTE_IDS.includes(q.id as (typeof NOTE_IDS)[number]),
    ),
    hearFromQuestion,
    additionalNoteQuestion,
  ];

  const errorMessage =
    searchParams.error === "validation"
      ? "Please fill all required fields correctly."
      : searchParams.error === "hearfrom-note"
        ? "Please add details in Additional note when 'Other' is selected for where you heard from us."
      : searchParams.error === "staff-email"
        ? "This email is already used by a staff account. Please use a different email to submit your inquiry."
        : searchParams.error === "template"
          ? "Application form is not available. Please try again later."
          : null;

  const successMessage = searchParams.success
    ? "Thank you! Your application has been submitted. Our team will contact you within 1–2 business days."
    : null;

  return (
    <main className="portal-theme min-h-screen py-10 text-slate-900">
      <div className="mx-auto max-w-3xl px-6">
        <div className="rounded-2xl border border-rose-200/40 bg-white/90 p-5 shadow-xl backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Image
                src="/loogo.png"
                alt="L&B Global logo"
                width={44}
                height={44}
                className="h-11 w-11 rounded-md object-contain"
                priority
              />
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-blue-600">
                  Overseas Education and Visa Services
                </p>
                <h1 className="text-2xl font-semibold text-slate-900">
                  {template?.title ?? "Student Inquiry Form"}
                </h1>
                <p className="mt-1 text-sm text-slate-600">
                  Submit your details and our team will contact you for guidance.
                </p>
              </div>
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
            action={submitQuestionnaireAction}
            className="mt-6 space-y-5 rounded-2xl border border-rose-200/40 bg-white/90 p-6 text-slate-900 shadow-xl backdrop-blur-sm"
          >
            <ApplyFormFields questions={merged} prioritizedCountries={prioritizedCountries} />
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

async function submitQuestionnaireAction(formData: FormData) {
  "use server";

  const answers: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key === "templateId") continue;
    if (typeof value === "string") answers[key] = value;
  }

  const fullName = answers.fullName?.trim() ?? "";
  const email = answers.email?.trim().toLowerCase() ?? "";
  const hearFrom = answers.hearFrom?.trim() ?? "";
  const additionalNote =
    answers.additionalNote?.trim() ??
    answers.additionalNotes?.trim() ??
    answers.note?.trim() ??
    answers.notes?.trim() ??
    answers.comment?.trim() ??
    answers.comments?.trim() ??
    "";

  if (!fullName || fullName.length < 2 || fullName.length > 100) {
    redirect("/apply?error=validation");
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    redirect("/apply?error=validation");
  }
  if (!hearFrom) {
    redirect("/apply?error=validation");
  }
  if (hearFrom.toLowerCase() === "others" && !additionalNote) {
    redirect("/apply?error=hearfrom-note");
  }

  // Normalize for analytics and consistency.
  answers.hearFrom = hearFrom;
  if (additionalNote) {
    answers.additionalNote = additionalNote;
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      role: true,
      name: true,
      studentProfile: {
        select: {
          id: true,
          phone: true,
          city: true,
          nationality: true,
          currentEducationLevel: true,
          targetCourse: true,
          preferredIntake: true,
          englishTestScore: true,
        },
      },
    },
  });
  if (existingUser && existingUser.role !== "USER") {
    redirect("/apply?error=staff-email");
  }

  const template = await prisma.questionnaireTemplate.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if (!template) redirect("/apply?error=template");

  const studentUser = existingUser
    ? await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          // Keep applicant record fresh in case they re-submit later.
          name: fullName,
        },
      })
    : await prisma.user.create({
        data: {
          name: fullName,
          email,
          role: "USER",
        },
      });

  const city = answers.city?.trim() ?? answers.addressCity?.trim() ?? "";
  const country = answers.country?.trim() ?? answers.addressCountry?.trim() ?? "";
  const phone = answers.phone?.trim() ?? "";
  const currentEducationLevel = answers.currentEducationLevel?.trim() ?? "";
  const targetCourse = answers.targetCourse?.trim() ?? "";
  const preferredIntake = answers.preferredIntake?.trim() ?? "";
  const englishTestScore = answers.englishTestScore?.trim() ?? "";

  let studentProfile: { id: string };
  if (existingUser?.studentProfile) {
    // Resubmissions: backfill any profile field the staff hasn't filled in yet,
    // but never overwrite values an admin may have edited in the dashboard.
    const existing = existingUser.studentProfile;
    const profileUpdate: Record<string, string> = {};
    if (!existing.phone && phone) profileUpdate.phone = phone;
    if (!existing.city && city) profileUpdate.city = city;
    if (!existing.nationality && country) profileUpdate.nationality = country;
    if (!existing.currentEducationLevel && currentEducationLevel)
      profileUpdate.currentEducationLevel = currentEducationLevel;
    if (!existing.targetCourse && targetCourse)
      profileUpdate.targetCourse = targetCourse;
    if (!existing.preferredIntake && preferredIntake)
      profileUpdate.preferredIntake = preferredIntake;
    if (!existing.englishTestScore && englishTestScore)
      profileUpdate.englishTestScore = englishTestScore;
    if (Object.keys(profileUpdate).length > 0) {
      await prisma.studentProfile.update({
        where: { id: existing.id },
        data: profileUpdate,
      });
    }
    studentProfile = { id: existing.id };
  } else {
    studentProfile = await prisma.studentProfile.create({
      data: {
        caseReference: await generateNextCaseReference(),
        userId: studentUser.id,
        phone: phone || null,
        city: city || null,
        nationality: country || null,
        currentEducationLevel: currentEducationLevel || null,
        targetCourse: targetCourse || null,
        preferredIntake: preferredIntake || null,
        englishTestScore: englishTestScore || null,
        followUpNotes: null,
      },
      select: { id: true },
    });
  }

  const submission = await prisma.questionnaireSubmission.create({
    data: {
      studentId: studentUser.id,
      templateId: template.id,
      assignedToId: null,
      sourceCity: city,
      sourceCountry: country,
      answers: answers as object,
    },
    select: { id: true },
  });

  const googleInquiryResult = await sendGoogleWorkspaceEmail({
    to: getContactInboxEmail(),
    subject: `New student inquiry: ${fullName}`,
    html: buildApplicationInquiryEmail({
      name: fullName,
      email,
      phone,
      city,
      country,
      targetCourse,
      preferredIntake,
      hearFrom,
    }),
    replyTo: email,
  });

  if (!googleInquiryResult.ok) {
    console.error("[apply] Google Workspace inquiry notification failed:", googleInquiryResult.error);
  }

  // Queue confirmation email (logs in dev; will send when provider is configured)
  await queueDevEmail({
    createdById: studentUser.id,
    toEmail: email,
    subject: "Application Received – L&B Global",
    htmlBody: `
      <p>Dear ${fullName},</p>
      <p>Thank you for submitting your application. Our team has received your inquiry and will contact you within 1–2 business days.</p>
      <p>Best regards,<br />L&B Global</p>
    `,
  });

  // Fan out a bell notification + email to every SUB_ADMIN and ADMIN so the
  // unassigned application surfaces immediately (failure here must not block
  // the applicant – the helper logs and swallows errors internally).
  await notifyStaffOfNewApplication({
    studentProfileId: studentProfile.id,
    studentUserId: studentUser.id,
    studentName: fullName,
    studentEmail: email,
    submissionId: submission.id,
    sourceCity: city || null,
    sourceCountry: country || null,
    hearFrom: hearFrom || null,
  });

  revalidatePath("/apply");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  revalidatePath("/");
  redirect("/apply?success=1");
}
