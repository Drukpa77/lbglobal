import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const questionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "textarea", "select"]),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  options: z.array(z.string()).optional(),
});

const templateSchema = z.array(questionSchema);

type SearchParams = Promise<{ error?: string; saved?: string }>;

export default async function QuestionnaireManagerPage(props: {
  searchParams: SearchParams;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();

  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const template = await prisma.questionnaireTemplate.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  const defaultQuestions = template?.questions ?? [
    {
      id: "fullName",
      label: "Full name",
      type: "text",
      required: true,
      placeholder: "Enter your full name",
    },
  ];

  return (
    <section className="space-y-6 text-gray-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Questionnaire Template Manager</h1>
          <p className="mt-1 text-sm text-gray-600">
            Update the active questionnaire JSON used on the student application page.
          </p>
        </div>
        <Link href="/dashboard/admin" className="rounded-md border px-3 py-2 text-sm">
          Back to admin dashboard
        </Link>
      </div>

      {searchParams.saved ? (
        <p className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Template saved successfully.
        </p>
      ) : null}
      {searchParams.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Invalid JSON format. Use the sample schema and ensure required fields exist.
        </p>
      ) : null}

      <form action={saveTemplateAction} className="space-y-4 rounded-lg border bg-white p-5">
        <label className="block text-sm">
          Template title
          <input
            type="text"
            name="title"
            defaultValue={template?.title ?? "Student or Visa Application Questionnaire"}
            className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-gray-900"
          />
        </label>
        <label className="block text-sm">
          Template description
          <input
            type="text"
            name="description"
            defaultValue={template?.description ?? ""}
            className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-gray-900"
          />
        </label>
        <label className="block text-sm">
          Questions JSON
          <textarea
            name="questionsJson"
            defaultValue={JSON.stringify(defaultQuestions, null, 2)}
            className="mt-1 min-h-[380px] w-full rounded-md border bg-white px-3 py-2 font-mono text-xs text-gray-900"
          />
        </label>
        <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
          Save template
        </button>
      </form>
    </section>
  );
}

async function saveTemplateAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    redirect("/dashboard");
  }

  const title = String(formData.get("title") ?? "").trim() || "Untitled Questionnaire";
  const description = String(formData.get("description") ?? "").trim();
  const questionsJson = String(formData.get("questionsJson") ?? "").trim();

  let parsedQuestions: unknown;
  try {
    parsedQuestions = JSON.parse(questionsJson);
  } catch {
    redirect("/dashboard/admin/questionnaire?error=json");
  }

  const validated = templateSchema.safeParse(parsedQuestions);
  if (!validated.success) {
    redirect("/dashboard/admin/questionnaire?error=schema");
  }

  await prisma.questionnaireTemplate.updateMany({
    where: { isActive: true },
    data: { isActive: false },
  });

  await prisma.questionnaireTemplate.create({
    data: {
      title,
      description: description || null,
      questions: validated.data,
      isActive: true,
    },
  });

  revalidatePath("/apply");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/questionnaire");
  redirect("/dashboard/admin/questionnaire?saved=1");
}
