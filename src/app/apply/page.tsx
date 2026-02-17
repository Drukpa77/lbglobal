import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prioritizedCountries } from "@/lib/countries";
import { getDashboardPath } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { parseTemplateQuestions } from "@/lib/questionnaire";

type SearchParams = Promise<{ error?: string }>;

export default async function ApplyPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "USER") {
    redirect(getDashboardPath(session.user.role));
  }

  const template = await prisma.questionnaireTemplate.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  const questions = template ? parseTemplateQuestions(template.questions) : [];

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 text-gray-900">
      <h1 className="text-2xl font-semibold">Student Questionnaire</h1>
      <p className="mt-2 text-sm text-gray-600">
        Fill this form to submit your Australia study details. Your assigned
        agent/admin will then create and maintain your profile.
      </p>

      {searchParams.error ? (
        <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Please fill all required fields.
        </p>
      ) : null}

      {!template ? (
        <div className="mt-6 rounded-lg border bg-white p-4 text-sm text-gray-700">
          No active questionnaire template found. Ask an admin to create one.
        </div>
      ) : (
        <form
          action={submitQuestionnaireAction}
          className="mt-6 space-y-5 rounded-lg border bg-white p-5 text-gray-900"
        >
          <input type="hidden" name="templateId" value={template.id} />

          {questions.map((question) => (
            <QuestionField key={question.id} question={question} />
          ))}

          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Submit questionnaire
          </button>
        </form>
      )}
    </main>
  );
}

function QuestionField({
  question,
}: {
  question: {
    id: string;
    label: string;
    type: "text" | "textarea" | "select";
    required?: boolean;
    placeholder?: string;
    options?: string[];
  };
}) {
  const inputName = `q_${question.id}`;

  if (question.type === "textarea") {
    return (
      <label className="block text-sm">
        {question.label}
        <textarea
          name={inputName}
          required={question.required}
          placeholder={question.placeholder}
          className="mt-1 min-h-24 w-full rounded-md border bg-white px-3 py-2 text-gray-900"
        />
      </label>
    );
  }

  if (question.type === "select") {
    const options =
      question.id.toLowerCase() === "country"
        ? [...prioritizedCountries]
        : (question.options ?? []);

    return (
      <label className="block text-sm">
        {question.label}
        <select
          name={inputName}
          required={question.required}
          defaultValue=""
          className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-gray-900"
        >
          <option value="" disabled>
            Select one
          </option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="block text-sm">
      {question.label}
      <input
        name={inputName}
        type="text"
        required={question.required}
        placeholder={question.placeholder}
        className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-gray-900"
      />
    </label>
  );
}

async function submitQuestionnaireAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "USER") {
    redirect("/login");
  }

  const templateId = String(formData.get("templateId") ?? "");
  const template = await prisma.questionnaireTemplate.findUnique({
    where: { id: templateId },
  });

  if (!template) {
    redirect("/apply");
  }

  const questions = parseTemplateQuestions(template.questions);
  const answers: Record<string, string> = {};

  for (const question of questions) {
    const key = `q_${question.id}`;
    const value = String(formData.get(key) ?? "").trim();
    if (question.required && !value) {
      redirect("/apply?error=required");
    }
    answers[question.id] = value;
  }

  const city = answers.city || null;
  const country = answers.country || null;
  const targetCourse = answers.targetCourse || null;
  const preferredIntake = answers.preferredIntake || null;
  const previousAssigned = await prisma.questionnaireSubmission.findFirst({
    where: {
      studentId: session.user.id,
      assignedToId: { not: null },
    },
    select: { assignedToId: true },
    orderBy: { submittedAt: "desc" },
  });

  await prisma.questionnaireSubmission.create({
    data: {
      studentId: session.user.id,
      templateId,
      assignedToId: previousAssigned?.assignedToId ?? null,
      sourceCity: city,
      sourceCountry: country,
      intendedCourse: targetCourse,
      intendedIntake: preferredIntake,
      answers,
    },
  });

  revalidatePath("/apply");
  revalidatePath("/dashboard/student");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  redirect("/dashboard/student");
}
