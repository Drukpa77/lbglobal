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

type Params = Promise<{ contractId: string }>;

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

  const { contractId } = await params;

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

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { studentProfile: { select: { userId: true } } },
  });
  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }
  if (contract.status !== "DRAFT") {
    return NextResponse.json({ error: "Only DRAFT contracts can be sent." }, { status: 409 });
  }

  const filename = parsed.data.pdfFilename.endsWith(".pdf")
    ? parsed.data.pdfFilename
    : `${parsed.data.pdfFilename}.pdf`;

  const org = contract.organizationName ?? "the agency";
  const applicant = contract.applicantName ?? contract.recipientEmail;

  const emailHtml = `
    <p>Dear ${escapeHtml(applicant)},</p>
    <p>Please find attached your <strong>Declaration Form for Submission of Documents</strong> from ${escapeHtml(org)}.</p>
    <p>Please review the document carefully, sign where indicated, and return a copy to us at your earliest convenience.</p>
    <p>If you have any questions, please do not hesitate to contact us.</p>
    <p>Kind regards,<br />${escapeHtml(org)}</p>
  `;

  const sendResult = await queueDevEmail({
    createdById: session.user.id,
    toEmail: contract.recipientEmail,
    subject: contract.subject,
    htmlBody: emailHtml,
    templateKey: "contract-pdf",
    relatedContractId: contract.id,
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
      { error: sendResult.errorMessage ?? "Failed to send contract email." },
      { status: 502 },
    );
  }

  await prisma.contract.update({
    where: { id: contract.id },
    data: { status: "SENT", sentAt: new Date() },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: contract.studentProfileId,
      entityType: "CONTRACT",
      entityId: contract.id,
      action: "Sent contract declaration with PDF attachment",
    },
  });

  if (contract.studentProfile?.userId) {
    revalidatePath(`/dashboard/students/${contract.studentProfile.userId}`);
  }
  revalidatePath(`/dashboard/contracts/${contract.id}/preview`);

  return NextResponse.json({ ok: true });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
