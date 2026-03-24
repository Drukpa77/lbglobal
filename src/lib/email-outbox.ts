import { type EmailLogStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type QueueEmailInput = {
  createdById: string;
  toEmail: string;
  subject: string;
  htmlBody: string;
  templateKey?: string | null;
  relatedContractId?: string | null;
  relatedInvoiceId?: string | null;
};

export async function queueDevEmail(input: QueueEmailInput) {
  const queued = await prisma.outboundEmailLog.create({
    data: {
      createdById: input.createdById,
      toEmail: input.toEmail,
      subject: input.subject,
      htmlBody: input.htmlBody,
      templateKey: input.templateKey ?? null,
      relatedContractId: input.relatedContractId ?? null,
      relatedInvoiceId: input.relatedInvoiceId ?? null,
      status: "QUEUED",
    },
  });

  const status: EmailLogStatus = input.toEmail.includes("@") ? "SENT" : "FAILED";

  return prisma.outboundEmailLog.update({
    where: { id: queued.id },
    data: {
      status,
      sentAt: status === "SENT" ? new Date() : null,
      errorMessage: status === "FAILED" ? "Invalid recipient email in dev sender." : null,
      providerMessageId:
        status === "SENT" ? `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` : null,
    },
  });
}
