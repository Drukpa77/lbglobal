import { type EmailLogStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type EmailAttachment = {
  name: string;
  contentBase64: string;
  contentType: string;
};

type QueueEmailInput = {
  createdById: string;
  toEmail: string;
  subject: string;
  htmlBody: string;
  templateKey?: string | null;
  relatedContractId?: string | null;
  relatedInvoiceId?: string | null;
  attachments?: EmailAttachment[];
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

  const recipientLooksValid = input.toEmail.includes("@");
  if (!recipientLooksValid) {
    return prisma.outboundEmailLog.update({
      where: { id: queued.id },
      data: {
        status: "FAILED",
        errorMessage: "Invalid recipient email.",
      },
    });
  }

  const result = await sendThroughProvider(input);

  const status: EmailLogStatus = result.ok ? "SENT" : "FAILED";
  return prisma.outboundEmailLog.update({
    where: { id: queued.id },
    data: {
      status,
      sentAt: status === "SENT" ? new Date() : null,
      errorMessage: result.ok ? null : result.error,
      providerMessageId: result.ok ? result.messageId ?? null : null,
    },
  });
}

type ProviderResult =
  | { ok: true; messageId?: string }
  | { ok: false; error: string };

async function sendThroughProvider(input: QueueEmailInput): Promise<ProviderResult> {
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim();
  const fromEmail = process.env.POSTMARK_FROM_EMAIL?.trim();

  if (!token || !fromEmail) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        error:
          "Postmark is not configured. Set POSTMARK_SERVER_TOKEN and POSTMARK_FROM_EMAIL.",
      };
    }
    console.info("[email-outbox] Dev mode - email not sent:", {
      to: input.toEmail,
      subject: input.subject,
      attachments: input.attachments?.length ?? 0,
    });
    return { ok: true, messageId: `dev-${Date.now()}` };
  }

  const body: Record<string, unknown> = {
    From: fromEmail,
    To: input.toEmail,
    Subject: input.subject,
    HtmlBody: input.htmlBody,
    MessageStream: process.env.POSTMARK_MESSAGE_STREAM?.trim() || "outbound",
  };

  if (input.attachments && input.attachments.length > 0) {
    body.Attachments = input.attachments.map((file) => ({
      Name: file.name,
      Content: file.contentBase64,
      ContentType: file.contentType,
    }));
  }

  try {
    const response = await fetch("https://api.postmarkapp.com/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Postmark-Server-Token": token,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      console.error("[email-outbox] Postmark error:", response.status, text);
      return { ok: false, error: `Postmark ${response.status}: ${text.slice(0, 240)}` };
    }
    const json = (await response.json()) as { MessageID?: string };
    return { ok: true, messageId: json.MessageID };
  } catch (error) {
    console.error("[email-outbox] Postmark request failed:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown email error.",
    };
  }
}
