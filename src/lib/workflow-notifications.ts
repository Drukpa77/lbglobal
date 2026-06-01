import type { Prisma, WorkflowNotificationType } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { queueDevEmail } from "@/lib/email-outbox";

type CreateWorkflowNotificationInput = {
  recipientId: string;
  actorId?: string | null;
  studentProfileId: string;
  documentId?: string | null;
  type: WorkflowNotificationType;
  title: string;
  message: string;
  note?: string | null;
  link: string;
  actionRequired?: boolean;
  metadata?: Prisma.InputJsonValue;
  sendEmail?: boolean;
};

export async function createWorkflowNotification(input: CreateWorkflowNotificationInput) {
  const notification = await prisma.workflowNotification.create({
    data: {
      recipientId: input.recipientId,
      actorId: input.actorId ?? null,
      studentProfileId: input.studentProfileId,
      documentId: input.documentId ?? null,
      type: input.type,
      title: input.title,
      message: input.message,
      note: input.note ?? null,
      link: input.link,
      actionRequired: input.actionRequired ?? true,
      metadata: input.metadata,
    },
  });

  if (input.sendEmail !== false) {
    try {
      await sendWorkflowNotificationEmail({
        ...input,
        notificationId: notification.id,
        actorId: input.actorId ?? null,
      });
    } catch (error) {
      console.error("sendWorkflowNotificationEmail failed", error);
    }
  }

  return notification;
}

type WorkflowNotificationEmailInput = CreateWorkflowNotificationInput & {
  notificationId: string;
  actorId: string | null;
};

async function sendWorkflowNotificationEmail(input: WorkflowNotificationEmailInput) {
  const [recipient, actor] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.recipientId },
      select: { email: true, name: true },
    }),
    input.actorId
      ? prisma.user.findUnique({
          where: { id: input.actorId },
          select: { email: true, name: true },
        })
      : null,
  ]);

  if (!recipient?.email) return;

  const actorLabel = actor ? actor.name?.trim() || actor.email : null;
  const subject = workflowEmailSubject(input);
  const url = absoluteWorkflowLink(input.link);
  const note = input.note?.trim();

  await queueDevEmail({
    createdById: input.actorId ?? input.recipientId,
    toEmail: recipient.email,
    subject,
    htmlBody: `
      <p>${escapeHtml(workflowEmailIntro(input, actorLabel))}</p>
      <p><strong>${escapeHtml(input.title)}</strong></p>
      <p>${escapeHtml(input.message)}</p>
      ${note ? `<p><strong>Note:</strong> ${escapeHtml(note)}</p>` : ""}
      <p><a href="${escapeHtml(url)}">Open this item in the dashboard</a></p>
    `,
    templateKey: `workflow-${input.type.toLowerCase().replace(/_/g, "-")}`,
  });
}

function workflowEmailSubject(input: CreateWorkflowNotificationInput) {
  switch (input.type) {
    case "NEW_STUDENT_APPLICATION":
      return input.title || "New student enquiry";
    case "STUDENT_DELEGATED":
      return input.title || "Student delegated to you";
    case "DOCUMENT_RETURNED":
      return "Document verification returned";
    case "DOCUMENT_REVERIFIED":
      return "Returned document re-verified";
    case "DOCUMENT_RETURN_DISPUTED":
      return "Document return disputed";
    case "DOCUMENT_REPLACEMENT_UPLOADED":
      return "Replacement document uploaded";
    case "DOCUMENT_RETURN_FOLLOW_UP":
      return "Returned document still pending";
    default:
      return input.title || "Workflow notification";
  }
}

function workflowEmailIntro(input: CreateWorkflowNotificationInput, actorLabel: string | null) {
  switch (input.type) {
    case "NEW_STUDENT_APPLICATION":
      return "A new student enquiry needs attention.";
    case "STUDENT_DELEGATED":
      return actorLabel
        ? `${actorLabel} delegated a student case to you.`
        : "A student case has been delegated to you.";
    case "DOCUMENT_RETURNED":
      return actorLabel
        ? `${actorLabel} returned a document you verified.`
        : "A document you verified has been returned.";
    case "DOCUMENT_REVERIFIED":
      return actorLabel
        ? `${actorLabel} re-verified a returned document.`
        : "A returned document has been re-verified.";
    case "DOCUMENT_RETURN_DISPUTED":
      return actorLabel
        ? `${actorLabel} disputed a returned document.`
        : "A returned document has been disputed.";
    case "DOCUMENT_REPLACEMENT_UPLOADED":
      return actorLabel
        ? `${actorLabel} uploaded a replacement document.`
        : "A replacement document has been uploaded.";
    case "DOCUMENT_RETURN_FOLLOW_UP":
      return "A returned document is still pending action.";
    default:
      return "You have a new workflow notification.";
  }
}

function absoluteWorkflowLink(link: string) {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  try {
    return new URL(link, baseUrl).toString();
  } catch {
    return link;
  }
}

type NotifyStaffOfNewApplicationInput = {
  studentProfileId: string;
  studentUserId: string;
  studentName: string;
  studentEmail: string;
  submissionId: string;
  sourceCity?: string | null;
  sourceCountry?: string | null;
  hearFrom?: string | null;
};

// Fan out a workflow-bell notification (and a queued email) to every active
// SUB_ADMIN and ADMIN whenever a student submits the public Apply form.
// Designed to fail soft: any error is logged but never blocks the student's
// submission flow.
export async function notifyStaffOfNewApplication(input: NotifyStaffOfNewApplicationInput) {
  try {
    const recipients = await prisma.user.findMany({
      where: { role: { in: ["SUB_ADMIN", "ADMIN"] } },
      select: { id: true, email: true },
    });

    if (recipients.length === 0) return;

    const displayName = input.studentName.trim() || input.studentEmail;
    const location = [input.sourceCity, input.sourceCountry]
      .map((part) => part?.trim())
      .filter((part): part is string => Boolean(part))
      .join(", ");

    const link = `/dashboard/sub-admin?tab=students&queue=unassigned#submission-${input.submissionId}`;
    const title = "New student application";
    const message = location
      ? `${displayName} applied from ${location}.`
      : `${displayName} submitted a new inquiry.`;
    const note = input.hearFrom ? `Heard from: ${input.hearFrom}` : null;

    await prisma.workflowNotification.createMany({
      data: recipients.map((recipient) => ({
        recipientId: recipient.id,
        actorId: input.studentUserId,
        studentProfileId: input.studentProfileId,
        type: "NEW_STUDENT_APPLICATION" as WorkflowNotificationType,
        title,
        message,
        note,
        link,
        actionRequired: true,
        metadata: {
          submissionId: input.submissionId,
          studentEmail: input.studentEmail,
        },
      })),
    });

    const htmlBody = `
      <p>A new student application has just been submitted.</p>
      <ul>
        <li><strong>Name:</strong> ${escapeHtml(displayName)}</li>
        <li><strong>Email:</strong> ${escapeHtml(input.studentEmail)}</li>
        ${location ? `<li><strong>Location:</strong> ${escapeHtml(location)}</li>` : ""}
        ${input.hearFrom ? `<li><strong>Heard from:</strong> ${escapeHtml(input.hearFrom)}</li>` : ""}
      </ul>
      <p>Open the unassigned queue to review and claim it.</p>
    `;

    await Promise.all(
      recipients.map((recipient) =>
        queueDevEmail({
          createdById: input.studentUserId,
          toEmail: recipient.email,
          subject: `New application: ${displayName}`,
          htmlBody,
          templateKey: "new-student-application",
        }),
      ),
    );
  } catch (error) {
    // Never block the apply flow if the notification fan-out fails.
    console.error("notifyStaffOfNewApplication failed", error);
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
