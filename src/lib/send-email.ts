import nodemailer from "nodemailer";

import {
  formatEnglishTestDisplay,
  formatVisaServiceDisplay,
} from "@/lib/visa-services";

type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
};

type SendEmailResult =
  | { ok: true; id?: string; dev?: boolean }
  | { ok: false; error: string };

export function getContactInboxEmail() {
  return process.env.CONTACT_INBOX_EMAIL?.trim() || "student@lbglobal.com.au";
}

function getGoogleWorkspaceFromAddress() {
  return (
    process.env.GOOGLE_WORKSPACE_FROM_EMAIL?.trim() ||
    process.env.GOOGLE_SMTP_USER?.trim() ||
    "student@lbglobal.com.au"
  );
}

function getGoogleSmtpConfig() {
  const user = process.env.GOOGLE_SMTP_USER?.trim();
  const password = process.env.GOOGLE_SMTP_PASSWORD?.trim();

  if (!user || !password) return null;

  const port = Number(process.env.GOOGLE_SMTP_PORT?.trim() || "465");
  return {
    host: process.env.GOOGLE_SMTP_HOST?.trim() || "smtp.gmail.com",
    port,
    secure: process.env.GOOGLE_SMTP_SECURE?.trim() === "false" ? false : port === 465,
    auth: {
      user,
      pass: password,
    },
  };
}

export async function sendGoogleWorkspaceEmail(
  input: SendEmailInput,
): Promise<SendEmailResult> {
  const config = getGoogleSmtpConfig();

  if (!config) {
    if (process.env.NODE_ENV === "production") {
      return {
        ok: false,
        error:
          "Google Workspace email is not configured. Set GOOGLE_SMTP_USER and GOOGLE_SMTP_PASSWORD.",
      };
    }

    console.info("[send-email] Dev mode - Google Workspace email not sent:", {
      to: input.to,
      subject: input.subject,
      replyTo: input.replyTo,
    });
    return { ok: true, dev: true };
  }

  try {
    const transporter = nodemailer.createTransport(config);
    const info = await transporter.sendMail({
      from: getGoogleWorkspaceFromAddress(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      replyTo: input.replyTo,
    });

    return { ok: true, id: info.messageId };
  } catch (error) {
    console.error("[send-email] Google Workspace SMTP error:", error);
    return {
      ok: false,
      error: "Unable to send email right now. Please try WhatsApp or call us.",
    };
  }
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

export function buildApplicationInquiryEmail(params: {
  name: string;
  email: string;
  phone?: string | null;
  city?: string | null;
  country?: string | null;
  visaServiceType?: string | null;
  otherServiceDescription?: string | null;
  targetCourse?: string | null;
  preferredIntake?: string | null;
  englishTestType?: string | null;
  englishTestScore?: string | null;
  hearFrom?: string | null;
}) {
  const englishTest = formatEnglishTestDisplay(
    params.englishTestType,
    params.englishTestScore,
  );
  const details = [
    ["Name", params.name],
    ["Email", params.email],
    ["Phone", params.phone],
    ["Location", [params.city, params.country].filter(Boolean).join(", ")],
    [
      "Service",
      formatVisaServiceDisplay({
        visaServiceType: params.visaServiceType,
        otherServiceDescription: params.otherServiceDescription,
      }),
    ],
    ["Target course", params.targetCourse],
    ["Preferred intake", params.preferredIntake],
    ["English test", englishTest],
    ["Heard from", params.hearFrom],
  ].filter((entry): entry is [string, string] => Boolean(entry[1]));

  return `
    <h2>New visa inquiry</h2>
    <ul>
      ${details
        .map(([label, value]) => `<li><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</li>`)
        .join("")}
    </ul>
  `;
}

export function buildContactAutoReplyEmail(params: { name: string }) {
  return `
    <p>Dear ${escapeHtml(params.name)},</p>
    <p>Thank you for contacting L&amp;B Global. We have received your message and will reply within 1-2 business days.</p>
    <p>Best regards,<br />L&amp;B Global</p>
  `;
}
