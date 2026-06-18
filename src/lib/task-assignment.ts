import type { Prisma, TaskStatus } from "@prisma/client";

import { revalidatePath } from "next/cache";

import { revalidateContributionsCache } from "@/lib/contributions-cache";
import { prisma } from "@/lib/prisma";
import { notifyTaskAssignment } from "@/lib/task-notifications";
import { notifyStudentTeamDelegationChange } from "@/lib/workflow-notifications";

export type TaskAssigneeOption = {
  id: string;
  name: string | null;
  email: string;
  role: string;
};

export async function listTaskAssigneeOptions(): Promise<TaskAssigneeOption[]> {
  return prisma.user.findMany({
    where: { role: { in: ["INTERNAL_STAFF", "SUB_ADMIN"] }, deletedAt: null },
    select: { id: true, name: true, email: true, role: true },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });
}

export async function resolveTaskAssignee(assigneeIdRaw: string) {
  const assigneeId = assigneeIdRaw.trim();
  if (!assigneeId) return null;
  return prisma.user.findFirst({
    where: { id: assigneeId, role: { in: ["INTERNAL_STAFF", "SUB_ADMIN"] }, deletedAt: null },
    select: { id: true, name: true, email: true, role: true },
  });
}

type TaskAccessUser = {
  role: string;
  id: string;
};

type TaskAccessRecord = {
  assigneeId: string;
  assignerId: string;
  studentProfile: { assignments: { assignedToId: string }[] };
};

export function userCanManageTask(user: TaskAccessUser, task: TaskAccessRecord) {
  if (user.role === "ADMIN") return true;
  if (user.id === task.assigneeId || user.id === task.assignerId) return true;
  return task.studentProfile.assignments.some((assignment) => assignment.assignedToId === user.id);
}

async function userCanManageTaskForStudent(
  user: TaskAccessUser,
  task: TaskAccessRecord & { studentProfile: { userId: string; assignments: { assignedToId: string }[] } },
) {
  if (userCanManageTask(user, task)) return true;
  if (user.role !== "SUB_ADMIN") return false;
  const allowed = await prisma.questionnaireSubmission.findFirst({
    where: {
      studentId: task.studentProfile.userId,
      OR: [{ assignedToId: user.id }, { assignedToId: null }],
    },
    select: { id: true },
  });
  return Boolean(allowed);
}

export function taskDashboardWhereForStaff(userId: string, isAdmin: boolean) {
  if (isAdmin) return {};
  return {
    OR: [
      { assigneeId: userId },
      { assignerId: userId },
      {
        studentProfile: {
          assignments: { some: { assignedToId: userId, isActive: true } },
        },
      },
    ],
  };
}

export function openTaskStatusFilter() {
  return { status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] as TaskStatus[] } };
}

/** How far back the "Completed" task view reaches. Older completions stay in the DB and activity log. */
export const COMPLETED_TASK_WINDOW_DAYS = 60;

export type TaskListView = "open" | "completed";

export function normalizeTaskListView(raw: string | undefined): TaskListView {
  return raw === "completed" ? "completed" : "open";
}

/**
 * DONE tasks completed within the recent window. Tasks marked DONE before
 * completion attribution existed (null completedAt) are kept visible so they
 * don't silently disappear.
 */
export function completedTaskStatusFilter() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - COMPLETED_TASK_WINDOW_DAYS);
  return {
    status: "DONE" as TaskStatus,
    OR: [{ completedAt: { gte: cutoff } }, { completedAt: null }],
  };
}

export function taskListOrderBy(view: TaskListView): Prisma.TaskOrderByWithRelationInput[] {
  return view === "completed"
    ? [{ completedAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }]
    : [{ dueDate: "asc" }, { status: "asc" }, { createdAt: "desc" }];
}

export function taskDashboardListWhereForAgent(userId: string, isAdmin: boolean) {
  if (isAdmin) return {};
  return {
    OR: [
      { assigneeId: userId },
      { assignerId: userId },
      {
        studentProfile: {
          OR: [
            { assignments: { some: { assignedToId: userId, isActive: true } } },
            {
              user: {
                submissions: {
                  some: {
                    OR: [{ assignedToId: userId }, { assignedToId: null }],
                  },
                },
              },
            },
          ],
        },
      },
    ],
  };
}

/** Add task assignee to the case team so they appear on the student Overview and can collaborate. */
export async function ensureStaffOnCaseTeam(input: {
  studentProfileId: string;
  studentUserId: string;
  staffId: string;
  actorId: string;
  taskTitle?: string;
}) {
  const staff = await resolveTaskAssignee(input.staffId);
  if (!staff) return { addedToTeam: false };

  const existing = await prisma.studentAssignment.findFirst({
    where: {
      studentProfileId: input.studentProfileId,
      assignedToId: staff.id,
    },
    select: { id: true, isActive: true },
  });

  if (existing?.isActive) {
    revalidateContributionsCache(input.studentUserId);
    return { addedToTeam: false };
  }

  const notes = input.taskTitle
    ? `Added to case team via task: ${input.taskTitle}`
    : "Added to case team via task assignment";

  if (existing) {
    await prisma.studentAssignment.update({
      where: { id: existing.id },
      data: {
        isActive: true,
        endedAt: null,
        assignedById: input.actorId,
        notes,
      },
    });
  } else {
    await prisma.studentAssignment.create({
      data: {
        studentProfileId: input.studentProfileId,
        assignedToId: staff.id,
        assignedById: input.actorId,
        notes,
        isActive: true,
      },
    });
  }

  await prisma.activityLog.create({
    data: {
      actorId: input.actorId,
      targetStudentProfileId: input.studentProfileId,
      targetUserId: input.studentUserId,
      entityType: "ASSIGNMENT",
      entityId: input.studentProfileId,
      action: `Added ${staff.name ?? staff.email} to case team via task assignment`,
      metadata: { assigneeId: staff.id, taskTitle: input.taskTitle ?? null },
    },
  });

  await notifyStudentTeamDelegationChange({
    studentProfileId: input.studentProfileId,
    studentUserId: input.studentUserId,
    actorId: input.actorId,
    assigneeId: staff.id,
    assigneeName: staff.name?.trim() || staff.email,
    assigneeRole: staff.role === "SUB_ADMIN" ? "SUB_ADMIN" : "INTERNAL_STAFF",
    change: "added",
    delegationNotes: notes,
    source: "task_assignment",
  });

  revalidateContributionsCache(input.studentUserId);

  return { addedToTeam: true };
}

export type OverviewTeamMember = {
  id: string;
  name: string;
  roleLabel: string;
  helpingViaTask?: boolean;
};

export function buildOverviewAssignedTeam(input: {
  assignments: Array<{
    assignedTo: { id: string; name: string | null; email: string; role: string };
  }>;
  openTaskAssignees: Array<{
    id: string;
    name: string | null;
    email: string;
    role: string;
  }>;
  submissionAgent?: { id: string; name: string | null; email: string } | null;
}) {
  const members = new Map<string, OverviewTeamMember>();

  for (const assignment of input.assignments) {
    members.set(assignment.assignedTo.id, {
      id: assignment.assignedTo.id,
      name: assignment.assignedTo.name ?? assignment.assignedTo.email,
      roleLabel: assignment.assignedTo.role === "SUB_ADMIN" ? "Agent" : "Case manager",
    });
  }

  for (const assignee of input.openTaskAssignees) {
    if (members.has(assignee.id)) continue;
    members.set(assignee.id, {
      id: assignee.id,
      name: assignee.name ?? assignee.email,
      roleLabel: assignee.role === "SUB_ADMIN" ? "Agent" : "Case manager",
      helpingViaTask: true,
    });
  }

  if (members.size === 0 && input.submissionAgent) {
    members.set(input.submissionAgent.id, {
      id: input.submissionAgent.id,
      name: input.submissionAgent.name ?? input.submissionAgent.email,
      roleLabel: "Agent",
    });
  }

  return Array.from(members.values());
}

export function taskDashboardWhereForAgent(userId: string, isAdmin: boolean) {
  if (isAdmin) return openTaskStatusFilter();
  return {
    ...openTaskStatusFilter(),
    OR: [
      { assigneeId: userId },
      { assignerId: userId },
      {
        studentProfile: {
          OR: [
            { assignments: { some: { assignedToId: userId, isActive: true } } },
            {
              user: {
                submissions: {
                  some: {
                    OR: [{ assignedToId: userId }, { assignedToId: null }],
                  },
                },
              },
            },
          ],
        },
      },
    ],
  };
}

export async function executeTaskReassignment(input: {
  taskId: string;
  newAssigneeId: string;
  actor: TaskAccessUser;
}) {
  const assignee = await resolveTaskAssignee(input.newAssigneeId);
  if (!assignee) {
    return { ok: false as const, reason: "invalid-assignee" as const };
  }

  const task = await prisma.task.findUnique({
    where: { id: input.taskId },
    include: {
      studentProfile: {
        select: {
          id: true,
          userId: true,
          assignments: {
            where: { isActive: true },
            select: { assignedToId: true },
          },
        },
      },
    },
  });
  if (!task) {
    return { ok: false as const, reason: "not-found" as const };
  }

  if (!(await userCanManageTaskForStudent(input.actor, task))) {
    return { ok: false as const, reason: "forbidden" as const };
  }

  if (task.assigneeId === assignee.id) {
    return { ok: true as const, changed: false as const, studentUserId: task.studentProfile.userId };
  }

  const previousAssigneeId = task.assigneeId;
  await prisma.task.update({
    where: { id: task.id },
    data: { assigneeId: assignee.id },
  });

  await prisma.activityLog.create({
    data: {
      actorId: input.actor.id,
      targetStudentProfileId: task.studentProfileId,
      entityType: "TASK",
      entityId: task.id,
      action: `Reassigned task to ${assignee.name ?? assignee.email}`,
      metadata: {
        previousAssigneeId,
        newAssigneeId: assignee.id,
      },
    },
  });

  await notifyTaskAssignment({
    taskId: task.id,
    taskTitle: task.title,
    studentProfileId: task.studentProfileId,
    studentUserId: task.studentProfile.userId,
    actorId: input.actor.id,
    previousAssigneeId,
    newAssigneeId: assignee.id,
    isNewTask: false,
  });

  await ensureStaffOnCaseTeam({
    studentProfileId: task.studentProfileId,
    studentUserId: task.studentProfile.userId,
    staffId: assignee.id,
    actorId: input.actor.id,
    taskTitle: task.title,
  });

  revalidateContributionsCache(task.studentProfile.userId);

  return {
    ok: true as const,
    changed: true as const,
    studentUserId: task.studentProfile.userId,
    studentProfileId: task.studentProfileId,
  };
}
