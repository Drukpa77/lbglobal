import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DeleteWithConfirm } from "@/components/delete-with-confirm";
import { queueDevEmail } from "@/lib/email-outbox";
import { prisma } from "@/lib/prisma";

type Params = Promise<{ invoiceId: string }>;

export default async function InvoicePreviewPage(props: { params: Params }) {
  const { invoiceId } = await props.params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      lineItems: true,
      studentProfile: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      template: true,
    },
  });
  if (!invoice) redirect("/dashboard");

  const studentName = invoice.studentProfile.user.name ?? invoice.studentProfile.user.email;
  const studentUserId = invoice.studentProfile.userId;

  return (
    <section className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "My Dashboard", href: "/dashboard" },
          { label: studentName, href: `/dashboard/students/${studentUserId}` },
          { label: "Invoice" },
        ]}
      />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Invoice Preview</h1>
          <p className="mt-1 text-sm text-gray-600">
            {invoice.invoiceNumber} · {studentName}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${invoiceStatusTone(invoice.status)}`}>
          {invoice.status}
        </span>
        <Link
          href={`/dashboard/students/${studentUserId}`}
          className="rounded-md border px-3 py-2 text-sm"
        >
          Back to student profile
        </Link>
      </div>

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Edit invoice details below, then save. Use Send Invoice only after checking the preview content.
        </div>
        <form action={updateInvoiceDraftAction} className="space-y-3">
          <input type="hidden" name="invoiceId" value={invoice.id} />
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block text-sm md:col-span-2">
              Email Subject
              <input
                name="subject"
                required
                defaultValue={invoice.subject}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              Currency
              <input
                name="currency"
                required
                defaultValue={invoice.currency}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <label className="block text-sm">
              Subtotal
              <input
                name="subtotal"
                type="number"
                step="0.01"
                defaultValue={invoice.subtotal}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              Tax
              <input
                name="taxAmount"
                type="number"
                step="0.01"
                defaultValue={invoice.taxAmount}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              Total
              <input
                name="totalAmount"
                type="number"
                step="0.01"
                defaultValue={invoice.totalAmount}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
            <label className="block text-sm">
              Due Date
              <input
                name="dueDate"
                type="date"
                defaultValue={invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : ""}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block text-sm">
            Invoice Message (plain text)
            <textarea
              name="messageText"
              required
              defaultValue={htmlToPlainText(invoice.htmlSnapshot)}
              className="mt-1 min-h-56 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <p className="text-xs text-gray-500">
            Tip: subtotal, tax, and total are editable in case you need manual adjustments.
          </p>
          <button type="submit" className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium">
            Save Changes
          </button>
        </form>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold">Invoice Details</p>
          <p className="text-sm text-gray-700">
            {invoice.currency} {invoice.totalAmount.toFixed(2)}
          </p>
        </div>
        <ul className="mt-3 space-y-2">
          {invoice.lineItems.map((item) => (
            <li key={item.id} className="rounded-md border border-gray-200 p-2 text-sm">
              <p className="font-medium">{item.description}</p>
              <p className="text-xs text-gray-600">
                Qty {item.quantity} × {invoice.currency} {item.unitPrice.toFixed(2)} ={" "}
                {invoice.currency} {item.amount.toFixed(2)}
              </p>
            </li>
          ))}
        </ul>
        <div className="mt-3 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
          <p>Subtotal: {formatMoney(invoice.currency, invoice.subtotal)}</p>
          <p>Tax: {formatMoney(invoice.currency, invoice.taxAmount)}</p>
          <p className="font-semibold">Total: {formatMoney(invoice.currency, invoice.totalAmount)}</p>
          <p className="mt-1 text-xs text-gray-600">
            Due: {invoice.dueDate ? invoice.dueDate.toLocaleDateString() : "Not set"}
          </p>
        </div>
        <article
          className="prose mt-4 max-w-none rounded-md border border-gray-200 bg-white p-4"
          dangerouslySetInnerHTML={{ __html: invoice.htmlSnapshot }}
        />
      </section>

      <div className="flex flex-wrap gap-3">
        {invoice.status === "DRAFT" && (
          <form action={sendInvoiceAction}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button type="submit" className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white">
              Send Invoice
            </button>
          </form>
        )}
        {invoice.status === "SENT" && (
          <form action={markInvoicePaidAction}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Mark as Paid
            </button>
          </form>
        )}
        <DeleteWithConfirm
          formAction={deleteInvoiceAction}
          confirmMessage={`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`}
          buttonLabel="Delete Invoice"
          buttonClassName="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700"
        >
          <input type="hidden" name="invoiceId" value={invoice.id} />
        </DeleteWithConfirm>
      </div>
    </section>
  );
}

async function sendInvoiceAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    redirect("/login");
  }
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { studentProfile: true, template: true },
  });
  if (!invoice) redirect("/dashboard");

  await queueDevEmail({
    createdById: session.user.id,
    toEmail: invoice.recipientEmail,
    subject: invoice.subject,
    htmlBody: invoice.htmlSnapshot,
    templateKey: invoice.template?.key,
    relatedInvoiceId: invoice.id,
  });

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: invoice.studentProfileId,
      entityType: "INVOICE",
      entityId: invoice.id,
      action: "Sent invoice email after preview approval",
    },
  });

  const student = await prisma.studentProfile.findUnique({
    where: { id: invoice.studentProfileId },
    select: { userId: true },
  });
  if (!student) redirect("/dashboard");

  revalidatePath(`/dashboard/invoices/${invoice.id}/preview`);
  revalidatePath(`/dashboard/students/${student.userId}`);
  redirect(`/dashboard/students/${student.userId}`);
}

async function updateInvoiceDraftAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    redirect("/login");
  }
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const currency = String(formData.get("currency") ?? "").trim().toUpperCase();
  const messageText = String(formData.get("messageText") ?? "").trim();
  const subtotal = Number(formData.get("subtotal") ?? 0);
  const taxAmount = Number(formData.get("taxAmount") ?? 0);
  const totalAmount = Number(formData.get("totalAmount") ?? 0);
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();

  if (!invoiceId || !subject || !currency || !messageText) {
    redirect(`/dashboard/invoices/${invoiceId}/preview`);
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, studentProfileId: true, status: true },
  });
  if (!invoice) redirect("/dashboard");

  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      subject,
      currency,
      subtotal: Number.isFinite(subtotal) ? subtotal : 0,
      taxAmount: Number.isFinite(taxAmount) ? taxAmount : 0,
      totalAmount: Number.isFinite(totalAmount) ? totalAmount : 0,
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
      htmlSnapshot: plainTextToHtml(messageText),
      status: invoice.status === "SENT" ? "DRAFT" : invoice.status,
      sentAt: invoice.status === "SENT" ? null : undefined,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: invoice.studentProfileId,
      entityType: "INVOICE",
      entityId: invoiceId,
      action: "Edited invoice preview content",
    },
  });

  revalidatePath(`/dashboard/invoices/${invoiceId}/preview`);
  redirect(`/dashboard/invoices/${invoiceId}/preview`);
}

function htmlToPlainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function plainTextToHtml(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/\n/g, "<br />")}</p>`);
  return paragraphs.join("");
}

function formatMoney(currency: string, amount: number) {
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: currency || "AUD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function invoiceStatusTone(status: string) {
  if (status === "SENT") return "bg-blue-50 text-blue-700";
  if (status === "PAID") return "bg-emerald-50 text-emerald-700";
  if (status === "OVERDUE") return "bg-amber-50 text-amber-700";
  if (status === "CANCELLED") return "bg-gray-200 text-gray-700";
  return "bg-gray-100 text-gray-700";
}

async function markInvoicePaidAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN" && session.user.role !== "INTERNAL_STAFF")) {
    redirect("/login");
  }
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) redirect("/dashboard");

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { studentProfile: { select: { userId: true } } },
  });
  if (!invoice || invoice.status !== "SENT" || !invoice.studentProfile) redirect("/dashboard");

  const studentUserId = invoice.studentProfile.userId;

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "PAID", paidAt: new Date() },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: invoice.studentProfileId,
      entityType: "INVOICE",
      entityId: invoice.id,
      action: `Marked invoice ${invoice.invoiceNumber} as paid`,
      metadata: { invoiceNumber: invoice.invoiceNumber },
    },
  });

  revalidatePath(`/dashboard/invoices/${invoice.id}/preview`);
  revalidatePath(`/dashboard/students/${studentUserId}`);
  redirect(`/dashboard/students/${studentUserId}`);
}

async function deleteInvoiceAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    redirect("/login");
  }
  const invoiceId = String(formData.get("invoiceId") ?? "");
  if (!invoiceId) redirect("/dashboard");

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { studentProfile: { select: { userId: true } } },
  });
  if (!invoice) redirect("/dashboard");

  await prisma.outboundEmailLog.deleteMany({
    where: { relatedInvoiceId: invoice.id },
  });
  await prisma.invoice.delete({
    where: { id: invoice.id },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: invoice.studentProfileId,
      entityType: "INVOICE",
      entityId: invoice.id,
      action: "Deleted invoice from preview page",
    },
  });

  revalidatePath(`/dashboard/students/${invoice.studentProfile.userId}`);
  redirect(`/dashboard/students/${invoice.studentProfile.userId}`);
}
