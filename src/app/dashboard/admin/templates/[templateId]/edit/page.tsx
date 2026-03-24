import { TemplateType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { TemplateEditor } from "@/components/template-editor";
import { prisma } from "@/lib/prisma";
import { extractTemplatePlaceholders } from "@/lib/template-renderer";

type Params = Promise<{ templateId: string }>;

const updateTemplateSchema = z.object({
  templateId: z.string().min(1),
  key: z
    .string()
    .trim()
    .min(3)
    .max(60)
    .regex(/^[a-z0-9_]+$/),
  name: z.string().trim().min(3).max(120),
  type: z.nativeEnum(TemplateType),
  subject: z.string().trim().min(3).max(255),
  htmlBody: z.string().trim().min(10),
  isActive: z.boolean().optional(),
});

export default async function EditTemplatePage(props: { params: Params }) {
  const { templateId } = await props.params;
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/dashboard");

  const template = await prisma.emailTemplate.findUnique({ where: { id: templateId } });
  if (!template) redirect("/dashboard/admin/templates");

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Edit Template</h1>
          <p className="mt-1 text-sm text-gray-600">
            Admin only. Update the template, review the live preview, then save.
          </p>
        </div>
        <Link href="/dashboard/admin/templates" className="rounded-md border px-3 py-2 text-sm">
          Back to templates
        </Link>
      </div>

      <form action={updateTemplateAction} className="space-y-4 rounded-lg border bg-white p-5">
        <input type="hidden" name="templateId" value={template.id} />

        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            Template Key
            <input
              name="key"
              required
              defaultValue={template.key}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            Template Name
            <input
              name="name"
              required
              defaultValue={template.name}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            Type
            <select
              name="type"
              defaultValue={template.type}
              className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
            >
              {Object.values(TemplateType).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="inline-flex items-center gap-2 text-sm md:pt-7">
            <input type="checkbox" name="isActive" defaultChecked={template.isActive} />
            Active template
          </label>
        </div>

        <TemplateEditor initialSubject={template.subject} initialHtmlBody={template.htmlBody} />

        <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
          Save template changes
        </button>
      </form>
    </section>
  );
}

async function updateTemplateAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/dashboard");

  const parsed = updateTemplateSchema.safeParse({
    templateId: String(formData.get("templateId") ?? ""),
    key: String(formData.get("key") ?? ""),
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? "GENERAL"),
    subject: String(formData.get("subject") ?? ""),
    htmlBody: String(formData.get("htmlBody") ?? ""),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) redirect("/dashboard/admin/templates");

  const data = parsed.data;
  const existing = await prisma.emailTemplate.findUnique({
    where: { id: data.templateId },
    select: { id: true, key: true },
  });
  if (!existing) redirect("/dashboard/admin/templates");

  if (existing.key !== data.key) {
    const keyTaken = await prisma.emailTemplate.findUnique({
      where: { key: data.key },
      select: { id: true },
    });
    if (keyTaken) redirect(`/dashboard/admin/templates/${data.templateId}/edit`);
  }

  await prisma.emailTemplate.update({
    where: { id: data.templateId },
    data: {
      key: data.key,
      name: data.name,
      type: data.type,
      subject: data.subject,
      htmlBody: data.htmlBody,
      placeholders: extractTemplatePlaceholders(`${data.subject} ${data.htmlBody}`),
      isActive: Boolean(data.isActive),
      createdById: session.user.id,
    },
  });

  revalidatePath("/dashboard/admin/templates");
  revalidatePath(`/dashboard/admin/templates/${data.templateId}/edit`);
  revalidatePath("/dashboard/students/[studentId]", "page");
  redirect("/dashboard/admin/templates");
}
