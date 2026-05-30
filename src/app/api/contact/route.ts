import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildContactAutoReplyEmail,
  buildContactInquiryEmail,
  getContactInboxEmail,
  sendGoogleWorkspaceEmail,
} from "@/lib/send-email";

const contactSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().min(2).max(200),
  message: z.string().trim().min(10).max(5000),
  company: z.string().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check your details and try again." },
      { status: 400 },
    );
  }

  const { name, email, subject, message, company } = parsed.data;

  if (company?.trim()) {
    return NextResponse.json({ ok: true });
  }

  const staffResult = await sendGoogleWorkspaceEmail({
    to: getContactInboxEmail(),
    subject: `[Website] ${subject}`,
    html: buildContactInquiryEmail({ name, email, subject, message }),
    replyTo: email,
  });

  if (!staffResult.ok) {
    return NextResponse.json({ error: staffResult.error }, { status: 503 });
  }

  const autoReply = await sendGoogleWorkspaceEmail({
    to: email,
    subject: "We received your message - L&B Global",
    html: buildContactAutoReplyEmail({ name }),
  });

  if (!autoReply.ok) {
    console.warn("[contact] Staff notified but auto-reply failed:", autoReply.error);
  }

  return NextResponse.json({ ok: true, dev: staffResult.dev === true });
}
