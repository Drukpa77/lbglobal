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
};

export async function createWorkflowNotification(input: CreateWorkflowNotificationInput) {
  return prisma.workflowNotification.create({
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
