type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
};

type SendEmailResult =
  | { ok: true; id?: string; dev?: boolean }
  | { ok: false; error: string };

function getContactFromAddress() {
  return (
    process.env.CONTACT_FROM_EMAIL?.trim() ||
    process.env.RESEND_FROM_EMAIL?.trim() ||
    "L&B Global <onboarding@resend.dev>"
  );
}

export function getContactInboxEmail() {
  return process.env.CONTACT_INBOX_EMAIL?.trim() || "student@lbglobal.com";
}

export async function sendTransactionalEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        error: "Email is not configured. Set RESEND_API_KEY on the server.",
      };
    }

    console.info("[send-email] Dev mode — email not sent:", {
      to: input.to,
      subject: input.subject,
      replyTo: input.replyTo,
    });
    return { ok: true, dev: true };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: getContactFromAddress(),
      to: [input.to],
      subject: input.subject,
      html: input.html,
      reply_to: input.replyTo,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("[send-email] Resend error:", response.status, body);
    return { ok: false, error: "Unable to send email right now. Please try WhatsApp or call us." };
  }

  const data = (await response.json()) as { id?: string };
  return { ok: true, id: data.id };
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildContactInquiryEmail(params: {
  name: string;
  email: string;
  subject: string;
  message: string;
}) {
  const { name, email, subject, message } = params;
  return `
    <h2>New website contact message</h2>
    <p><strong>Name:</strong> ${escapeHtml(name)}</p>
    <p><strong>Email:</strong> ${escapeHtml(email)}</p>
    <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
    <p><strong>Message:</strong></p>
    <p style="white-space:pre-wrap">${escapeHtml(message)}</p>
  `;
}

export function buildContactAutoReplyEmail(params: { name: string }) {
  return `
    <p>Dear ${escapeHtml(params.name)},</p>
    <p>Thank you for contacting L&amp;B Global. We have received your message and will reply within 1–2 business days.</p>
    <p>Best regards,<br />L&amp;B Global</p>
  `;
}
