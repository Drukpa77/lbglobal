import type { Prisma, WorkflowNotificationType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

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
