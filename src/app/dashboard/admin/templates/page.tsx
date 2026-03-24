import { TemplateType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";

import { auth } from "@/auth";
import { DeleteWithConfirm } from "@/components/delete-with-confirm";
import { prisma } from "@/lib/prisma";
import { extractTemplatePlaceholders } from "@/lib/template-renderer";

const templateFormSchema = z.object({
  id: z.string().optional(),
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

export default async function AdminTemplatesPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/dashboard");

  const templates = await prisma.emailTemplate.findMany({
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Email & Document Templates</h1>
          <p className="mt-1 text-sm text-gray-600">
            Manage contract, invoice, follow-up and general email templates.
          </p>
        </div>
        <Link href="/dashboard/admin" className="rounded-md border px-3 py-2 text-sm">
          Back to admin dashboard
        </Link>
      </div>

      <form action={saveTemplateAction} className="space-y-4 rounded-lg border bg-white p-5">
        <h2 className="text-sm font-semibold">Create New Template</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            Template Key
            <input name="key" required placeholder="contract_default" className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            Template Name
            <input name="name" required placeholder="Default Contract Template" className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm" />
          </label>
          <label className="block text-sm">
            Type
            <select name="type" defaultValue="GENERAL" className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm">
              {Object.values(TemplateType).map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Subject
            <input name="subject" required placeholder="Hello {{studentName}}" className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm" />
          </label>
        </div>
        <label className="block text-sm">
          HTML Body
          <textarea
            name="htmlBody"
            required
            className="mt-1 min-h-40 w-full rounded-md border bg-white px-3 py-2 font-mono text-xs"
            placeholder="<p>Dear {{studentName}}</p>"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked />
          Active template
        </label>
        <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
          Save template
        </button>
      </form>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="text-sm font-semibold">Existing Templates</h2>
        {templates.length === 0 ? (
          <p className="mt-2 text-sm text-gray-600">No templates yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {templates.map((template) => (
              <li key={template.id} className="rounded-md border border-gray-200 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">
                      {template.name}{" "}
                      <span className="text-xs font-normal text-gray-500">({template.key})</span>
                    </p>
                    <p className="text-xs text-gray-600">
                      Type: {template.type} · {template.isActive ? "Active" : "Inactive"}
                    </p>
                    <p className="mt-1 text-xs text-gray-600">
                      Placeholders: {extractTemplatePlaceholders(`${template.subject} ${template.htmlBody}`).join(", ") || "None"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/dashboard/admin/templates/${template.id}/edit`}
                      className="rounded-md border border-blue-300 bg-blue-50 px-3 py-1 text-xs text-blue-700"
                    >
                      Edit
                    </Link>
                    <DeleteWithConfirm
                      formAction={deleteTemplateAction}
                      confirmMessage={`Delete template "${template.name}"? This cannot be undone.`}
                      buttonLabel="Delete"
                      buttonClassName="rounded-md border border-red-300 bg-red-50 px-3 py-1 text-xs text-red-700"
                    >
                      <input type="hidden" name="templateId" value={template.id} />
                    </DeleteWithConfirm>
                  </div>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-blue-600">Preview subject/body</summary>
                  <pre className="mt-2 whitespace-pre-wrap rounded-md border border-gray-200 bg-gray-50 p-2 text-[11px] text-gray-700">
                    Subject: {template.subject}
                    {"\n\n"}
                    {template.htmlBody}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

async function saveTemplateAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/dashboard");

  const parsed = templateFormSchema.safeParse({
    id: String(formData.get("id") ?? "") || undefined,
    key: String(formData.get("key") ?? ""),
    name: String(formData.get("name") ?? ""),
    type: String(formData.get("type") ?? "GENERAL"),
    subject: String(formData.get("subject") ?? ""),
    htmlBody: String(formData.get("htmlBody") ?? ""),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) redirect("/dashboard/admin/templates");

  const data = parsed.data;
  await prisma.emailTemplate.upsert({
    where: { key: data.key },
    update: {
      name: data.name,
      type: data.type,
      subject: data.subject,
      htmlBody: data.htmlBody,
      placeholders: extractTemplatePlaceholders(`${data.subject} ${data.htmlBody}`),
      isActive: Boolean(data.isActive),
      createdById: session.user.id,
    },
    create: {
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
  revalidatePath("/dashboard/students/[studentId]", "page");
  redirect("/dashboard/admin/templates");
}

async function deleteTemplateAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/dashboard");

  const templateId = String(formData.get("templateId") ?? "");
  if (!templateId) redirect("/dashboard/admin/templates");
  await prisma.emailTemplate.delete({ where: { id: templateId } });
  revalidatePath("/dashboard/admin/templates");
  redirect("/dashboard/admin/templates");
}
