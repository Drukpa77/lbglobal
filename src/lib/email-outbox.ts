import { type EmailLogStatus } from "@prisma/client";
import { ServerClient, type Message } from "postmark";

import { prisma } from "@/lib/prisma";
import { isGoogleWorkspaceConfigured, sendGoogleWorkspaceEmail } from "@/lib/send-email";

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
  replyTo?: string | null;
  templateKey?: string | null;
  relatedContractId?: string | null;
  relatedInvoiceId?: string | null;
  attachments?: EmailAttachment[];
};

export async function queueDevEmail(input: QueueEmailInput) {
  const plannedProvider = getPlannedProvider();
  const queued = await prisma.outboundEmailLog.create({
    data: {
      createdById: input.createdById,
      toEmail: input.toEmail,
      subject: input.subject,
      htmlBody: input.htmlBody,
      templateKey: input.templateKey ?? null,
      relatedContractId: input.relatedContractId ?? null,
      relatedInvoiceId: input.relatedInvoiceId ?? null,
      provider: plannedProvider,
      status: "QUEUED",
    },
  });

  const recipientLooksValid = input.toEmail.includes("@");
  if (!recipientLooksValid) {
    return prisma.outboundEmailLog.update({
      where: { id: queued.id },
      data: {
        status: "FAILED",
        errorMessage: normalizeErrorMessage("Invalid recipient email."),
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
      errorMessage: result.ok ? null : normalizeErrorMessage(result.error),
      provider: result.provider,
      providerMessageId: result.ok ? result.messageId ?? null : null,
    },
  });
}

type ProviderResult =
  | { ok: true; provider: "POSTMARK" | "GOOGLE_WORKSPACE" | "DEV"; messageId?: string }
  | { ok: false; provider: "POSTMARK" | "GOOGLE_WORKSPACE"; error: string };

function normalizeErrorMessage(message: string) {
  return message.slice(0, 4000);
}

export function getPlannedProvider() {
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim();
  const fromEmail = process.env.POSTMARK_FROM_EMAIL?.trim();
  if (token && fromEmail) return "POSTMARK";
  return process.env.NODE_ENV === "production" ? "POSTMARK" : "DEV";
}

/** Lightweight summary of the email configuration for admin diagnostics. */
export function getEmailProviderStatus() {
  const hasToken = Boolean(process.env.POSTMARK_SERVER_TOKEN?.trim());
  const fromEmail = process.env.POSTMARK_FROM_EMAIL?.trim() || null;
  return {
    plannedProvider: getPlannedProvider(),
    hasToken,
    fromEmail,
    messageStream: process.env.POSTMARK_MESSAGE_STREAM?.trim() || "outbound",
    configured: hasToken && Boolean(fromEmail),
    fallbackConfigured: isGoogleWorkspaceConfigured(),
  };
}

async function sendThroughProvider(input: QueueEmailInput): Promise<ProviderResult> {
  const token = process.env.POSTMARK_SERVER_TOKEN?.trim();
  const fromEmail = process.env.POSTMARK_FROM_EMAIL?.trim();

  // Primary path: Postmark, when configured.
  if (token && fromEmail) {
    const postmarkResult = await sendViaPostmark(input, token, fromEmail);
    if (postmarkResult.ok) return postmarkResult;

    // Postmark rejected the message (e.g. account pending approval). Try the
    // Google Workspace SMTP fallback so the email still reaches the recipient.
    const fallback = await sendViaGoogleWorkspaceFallback(input);
    if (fallback?.ok) {
      console.warn(
        "[email-outbox] Postmark failed; delivered via Google Workspace fallback:",
        postmarkResult.error,
      );
      return fallback;
    }

    return {
      ok: false,
      provider: "POSTMARK",
      error: fallback
        ? `${postmarkResult.error} | Google Workspace fallback also failed: ${fallback.error}`
        : postmarkResult.error,
    };
  }

  // Postmark not configured: try the Google Workspace fallback directly.
  const fallback = await sendViaGoogleWorkspaceFallback(input);
  if (fallback?.ok) return fallback;
  if (fallback) {
    return { ok: false, provider: "GOOGLE_WORKSPACE", error: fallback.error };
  }

  // Nothing configured.
  if (process.env.NODE_ENV === "production") {
    return {
      ok: false,
      provider: "POSTMARK",
      error:
        "No email provider configured. Set POSTMARK_SERVER_TOKEN and POSTMARK_FROM_EMAIL, or GOOGLE_SMTP_USER and GOOGLE_SMTP_PASSWORD.",
    };
  }
  console.info("[email-outbox] Dev mode - email not sent:", {
    to: input.toEmail,
    subject: input.subject,
    attachments: input.attachments?.length ?? 0,
  });
  return { ok: true, provider: "DEV", messageId: `dev-${Date.now()}` };
}

async function sendViaPostmark(
  input: QueueEmailInput,
  token: string,
  fromEmail: string,
): Promise<ProviderResult> {
  const message: Message = {
    From: fromEmail,
    To: input.toEmail,
    Subject: input.subject,
    HtmlBody: input.htmlBody,
    MessageStream: process.env.POSTMARK_MESSAGE_STREAM?.trim() || "outbound",
  };

  const replyTo = input.replyTo?.trim() || process.env.POSTMARK_REPLY_TO_EMAIL?.trim();
  if (replyTo) {
    message.ReplyTo = replyTo;
  }

  if (input.attachments && input.attachments.length > 0) {
    message.Attachments = input.attachments.map((file) => ({
      Name: file.name,
      Content: file.contentBase64,
      ContentType: file.contentType,
      ContentID: null,
    }));
  }

  try {
    const client = new ServerClient(token);
    const response = await client.sendEmail(message);
    return { ok: true, provider: "POSTMARK", messageId: response.MessageID };
  } catch (error) {
    const { code, message: detail } = describePostmarkError(error);
    console.error("[email-outbox] Postmark error:", code ?? "unknown", detail);
    return {
      ok: false,
      provider: "POSTMARK",
      error: code ? `Postmark ${code}: ${detail}` : `Postmark error: ${detail}`,
    };
  }
}

// Returns null when Google Workspace SMTP isn't configured (so the caller can
// distinguish "unavailable" from "tried and failed").
async function sendViaGoogleWorkspaceFallback(
  input: QueueEmailInput,
): Promise<{ ok: true; provider: "GOOGLE_WORKSPACE"; messageId?: string } | { ok: false; error: string } | null> {
  if (!isGoogleWorkspaceConfigured()) return null;

  const result = await sendGoogleWorkspaceEmail({
    to: input.toEmail,
    subject: input.subject,
    html: input.htmlBody,
    replyTo: input.replyTo?.trim() || process.env.POSTMARK_REPLY_TO_EMAIL?.trim() || undefined,
    attachments: input.attachments?.map((file) => ({
      filename: file.name,
      contentBase64: file.contentBase64,
      contentType: file.contentType,
    })),
  });

  if (result.ok) {
    return { ok: true, provider: "GOOGLE_WORKSPACE", messageId: result.id };
  }
  return { ok: false, error: result.error };
}

// The Postmark SDK rejects with an error carrying a numeric ErrorCode and a
// human-readable message. Extract both so failures in OutboundEmailLog point
// straight at the cause (e.g. 412 = approval pending, 406 = inactive recipient).
function describePostmarkError(error: unknown): { code: number | null; message: string } {
  if (error && typeof error === "object") {
    const maybe = error as { code?: unknown; message?: unknown };
    const code = typeof maybe.code === "number" ? maybe.code : null;
    const message =
      typeof maybe.message === "string" && maybe.message.trim().length > 0
        ? maybe.message
        : "Unknown email error.";
    return { code, message };
  }
  return { code: null, message: "Unknown email error." };
}
