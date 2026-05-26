import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { queueDevEmail } from "@/lib/email-outbox";
import { prisma } from "@/lib/prisma";

const sendSchema = z.object({
  pdfBase64: z.string().min(100),
  pdfFilename: z.string().trim().min(1).max(200),
});

type Params = Promise<{ invoiceId: string }>;

export async function POST(request: Request, { params }: { params: Params }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { invoiceId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { studentProfile: { select: { userId: true } } },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (invoice.status !== "DRAFT") {
    return NextResponse.json({ error: "Only DRAFT invoices can be sent." }, { status: 409 });
  }

  const filename = parsed.data.pdfFilename.endsWith(".pdf")
    ? parsed.data.pdfFilename
    : `${parsed.data.pdfFilename}.pdf`;

  const summaryHtml = `
    <p>Hi ${escapeHtml(invoice.billToName || "")},</p>
    <p>Please find attached invoice <strong>${escapeHtml(invoice.invoiceNumber)}</strong>${
      invoice.dueDate ? ` due on ${invoice.dueDate.toLocaleDateString()}` : ""
    }.</p>
    <p>Total: <strong>${invoice.currency} ${invoice.totalAmount.toFixed(2)}</strong></p>
    ${invoice.remarks ? `<p>${escapeHtml(invoice.remarks).replace(/\n/g, "<br />")}</p>` : ""}
    <p>Best regards,<br />${escapeHtml(invoice.companyName ?? "L&B Global")}</p>
  `;

  const sendResult = await queueDevEmail({
    createdById: session.user.id,
    toEmail: invoice.recipientEmail,
    subject: invoice.subject,
    htmlBody: summaryHtml,
    templateKey: "invoice-pdf",
    relatedInvoiceId: invoice.id,
    attachments: [
      {
        name: filename,
        contentBase64: parsed.data.pdfBase64,
        contentType: "application/pdf",
      },
    ],
  });

  if (sendResult.status !== "SENT") {
    return NextResponse.json(
      { error: sendResult.errorMessage ?? "Failed to send invoice email." },
      { status: 502 },
    );
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "SENT", sentAt: new Date() },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: invoice.studentProfileId,
      entityType: "INVOICE",
      entityId: invoice.id,
      action: "Sent invoice with PDF attachment",
    },
  });

  if (invoice.studentProfile?.userId) {
    revalidatePath(`/dashboard/students/${invoice.studentProfile.userId}`);
  }
  revalidatePath(`/dashboard/invoices/${invoice.id}/preview`);

  return NextResponse.json({ ok: true });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
