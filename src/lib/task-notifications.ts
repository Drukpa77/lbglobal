import { prisma } from "@/lib/prisma";
import { createWorkflowNotification } from "@/lib/workflow-notifications";

type NotifyTaskAssignmentInput = {
  taskId: string;
  taskTitle: string;
  studentProfileId: string;
  studentUserId: string;
  actorId: string;
  previousAssigneeId: string | null;
  newAssigneeId: string;
  isNewTask?: boolean;
};

function staffRoleLabel(role: string) {
  return role === "SUB_ADMIN" ? "agent" : "case manager";
}

/** Notify assignee, previous owner, and actor when a task is created or reassigned. */
export async function notifyTaskAssignment(input: NotifyTaskAssignmentInput) {
  try {
    const [actor, newAssignee, previousAssignee, studentProfile] = await Promise.all([
      prisma.user.findUnique({
        where: { id: input.actorId },
        select: { id: true, name: true, email: true },
      }),
      prisma.user.findUnique({
        where: { id: input.newAssigneeId },
        select: { id: true, name: true, email: true, role: true },
      }),
      input.previousAssigneeId && input.previousAssigneeId !== input.newAssigneeId
        ? prisma.user.findUnique({
            where: { id: input.previousAssigneeId },
            select: { id: true, name: true, email: true },
          })
        : null,
      prisma.studentProfile.findUnique({
        where: { id: input.studentProfileId },
        select: { user: { select: { name: true, email: true } } },
      }),
    ]);

    if (!newAssignee) return;

    const actorLabel = actor?.name?.trim() || actor?.email || "A team member";
    const clientLabel =
      studentProfile?.user.name?.trim() || studentProfile?.user.email || "a client";
    const assigneeLabel = newAssignee.name?.trim() || newAssignee.email;
    const link = `/dashboard/students/${input.studentUserId}?tab=tasks`;
    const baseMetadata = {
      taskId: input.taskId,
      change: input.isNewTask ? "created" : "reassigned",
    };

    const notifications: Parameters<typeof createWorkflowNotification>[0][] = [];

    if (input.newAssigneeId !== input.actorId) {
      notifications.push({
        recipientId: input.newAssigneeId,
        actorId: input.actorId,
        studentProfileId: input.studentProfileId,
        type: "TASK_ASSIGNED",
        title: input.isNewTask ? "New task assigned to you" : "Task assigned to you",
        message: input.isNewTask
          ? `${actorLabel} assigned you "${input.taskTitle}" for ${clientLabel}.`
          : `${actorLabel} assigned "${input.taskTitle}" (${clientLabel}) to you.`,
        link,
        actionRequired: true,
        metadata: { ...baseMetadata, taskNotice: "assigned_to_you" },
      });
    }

    if (
      previousAssignee &&
      previousAssignee.id !== input.newAssigneeId &&
      previousAssignee.id !== input.actorId
    ) {
      const previousLabel = previousAssignee.name?.trim() || previousAssignee.email;
      notifications.push({
        recipientId: previousAssignee.id,
        actorId: input.actorId,
        studentProfileId: input.studentProfileId,
        type: "TASK_ASSIGNED",
        title: "Task reassigned",
        message: `${actorLabel} reassigned "${input.taskTitle}" (${clientLabel}) from you to ${assigneeLabel}.`,
        link,
        actionRequired: true,
        metadata: { ...baseMetadata, taskNotice: "reassigned_from_you" },
      });
    }

    const actorConfirmationMessage = input.isNewTask
      ? input.newAssigneeId === input.actorId
        ? `You created "${input.taskTitle}" for ${clientLabel} and assigned it to yourself.`
        : `You created "${input.taskTitle}" for ${clientLabel} and assigned it to ${assigneeLabel} (${staffRoleLabel(newAssignee.role)}).`
      : input.newAssigneeId === input.actorId
        ? `You reassigned "${input.taskTitle}" (${clientLabel}) to yourself.`
        : `You reassigned "${input.taskTitle}" (${clientLabel}) to ${assigneeLabel} (${staffRoleLabel(newAssignee.role)}).`;

    notifications.push({
      recipientId: input.actorId,
      actorId: input.actorId,
      studentProfileId: input.studentProfileId,
      type: "TASK_ASSIGNED",
      title: input.isNewTask ? "Task created" : "Task reassigned",
      message: actorConfirmationMessage,
      link,
      actionRequired: true,
      metadata: { ...baseMetadata, taskNotice: "change_by_actor" },
    });

    await Promise.all(notifications.map((notification) => createWorkflowNotification(notification)));
  } catch (error) {
    console.error("notifyTaskAssignment failed", error);
  }
}
