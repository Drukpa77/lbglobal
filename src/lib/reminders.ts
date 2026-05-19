import { cache } from "react";

import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildSubmissionWhere } from "@/lib/submission-filters";
import { caseStageLabel, isTerminalStage } from "@/lib/case-stage";

export type ReminderType =
  | "followup"
  | "visa_expiry"
  | "task_due"
  | "contract_reminder"
  | "invoice_reminder"
  | "stage_stalled"
  | "stage_info";

export type ReminderSeverity = "info" | "warning" | "urgent";

export type Reminder = {
  id: string;
  type: ReminderType;
  title: string;
  description: string;
  studentId: string;
  studentName: string;
  link: string;
  date: Date;
  severity: ReminderSeverity;
};

const VISA_EXPIRY_DAYS = 90;
const FOLLOWUP_OVERDUE_DAYS = 0;
const TASK_DUE_DAYS = 3;
const STAGE_STALLED_WARN_DAYS = 14;
const STAGE_STALLED_URGENT_DAYS = 30;

function daysUntil(date: Date, from: Date): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const f = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((d.getTime() - f.getTime()) / (1000 * 60 * 60 * 24));
}

export const getRemindersForUser = cache(async function getRemindersForUser(
  role: Role,
  userId: string,
): Promise<Reminder[]> {
  const now = new Date();
  const reminders: Reminder[] = [];
  const seen = new Set<string>();

  const addReminder = (r: Reminder) => {
    const key = `${r.type}-${r.id}-${r.studentId}`;
    if (seen.has(key)) return;
    seen.add(key);
    reminders.push(r);
  };

  if (role === "USER") {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!profile?.user) return [];

    const studentId = profile.user.id;
    const studentName = profile.user.name ?? profile.user.email;
    const link = "/dashboard/student";

    addReminder({
      id: `stage-${profile.id}`,
      type: "stage_info",
      title: "Your case stage",
      description: `Currently at: ${caseStageLabel(profile.caseStage)}`,
      studentId,
      studentName,
      link: "/dashboard/student",
      date: profile.caseStageUpdatedAt,
      severity: "info",
    });

    if (profile.visaExpiryDate) {
      const days = daysUntil(profile.visaExpiryDate, now);
      if (days <= VISA_EXPIRY_DAYS && days >= 0) {
        addReminder({
          id: `visa-${profile.id}`,
          type: "visa_expiry",
          title: "Visa expiry soon",
          description: `Your visa expires in ${days} days (${profile.visaExpiryDate.toLocaleDateString()})`,
          studentId,
          studentName,
          link: "/dashboard/student?focus=visa",
          date: profile.visaExpiryDate,
          severity: days <= 30 ? "urgent" : days <= 60 ? "warning" : "info",
        });
      } else if (days < 0) {
        addReminder({
          id: `visa-${profile.id}`,
          type: "visa_expiry",
          title: "Visa expired",
          description: `Your visa expired ${Math.abs(days)} days ago`,
          studentId,
          studentName,
          link: "/dashboard/student?focus=visa",
          date: profile.visaExpiryDate,
          severity: "urgent",
        });
      }
    }

    if (profile.nextFollowUpDate && profile.nextFollowUpDate <= now) {
      addReminder({
        id: `followup-${profile.id}`,
        type: "followup",
        title: "Follow-up overdue",
        description: `Follow-up was due ${profile.nextFollowUpDate.toLocaleDateString()}`,
        studentId,
        studentName,
        link: "/dashboard/student?focus=followup",
        date: profile.nextFollowUpDate,
        severity: "warning",
      });
    }

    const contracts = await prisma.contract.findMany({
      where: {
        studentProfileId: profile.id,
        status: { in: ["DRAFT", "SENT"] },
      },
      select: { id: true, title: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    for (const c of contracts) {
      if (c.status === "SENT") {
        addReminder({
          id: `contract-${c.id}`,
          type: "contract_reminder",
          title: "Contract pending",
          description: `${c.title} – check your email for the acceptance link`,
          studentId,
          studentName,
          link: `/dashboard/contracts/${c.id}/preview`,
          date: c.createdAt,
          severity: "warning",
        });
      }
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        studentProfileId: profile.id,
        status: { in: ["DRAFT", "SENT", "OVERDUE"] },
        dueDate: { not: null },
      },
      select: { id: true, title: true, dueDate: true, status: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    for (const inv of invoices) {
      if (inv.dueDate && inv.status !== "PAID") {
        const days = daysUntil(inv.dueDate, now);
        const isOverdue = days < 0;
        addReminder({
          id: `invoice-${inv.id}`,
          type: "invoice_reminder",
          title: isOverdue ? "Invoice overdue" : "Invoice due soon",
          description: `${inv.title} – due ${inv.dueDate.toLocaleDateString()}${isOverdue ? ` (${Math.abs(days)} days overdue)` : ""}`,
          studentId,
          studentName,
          link: "/dashboard/student?focus=invoice",
          date: inv.dueDate,
          severity: isOverdue ? "urgent" : days <= 3 ? "warning" : "info",
        });
      }
    }

    reminders.sort((a, b) => a.date.getTime() - b.date.getTime());
    return reminders.slice(0, 15);
  }

  const isAdmin = role === "ADMIN";
  const isSubAdmin = role === "SUB_ADMIN";
  const isInternalStaff = role === "INTERNAL_STAFF";

  let studentProfileIds: string[] = [];
  if (isAdmin) {
    const profiles = await prisma.studentProfile.findMany({
      select: { id: true, userId: true },
      take: 500,
    });
    studentProfileIds = profiles.map((p) => p.id);
  } else if (isSubAdmin) {
    const scopedWhere = buildSubmissionWhere({
      role: "SUB_ADMIN",
      userId,
      includeUnassignedForSubAdmin: true,
    });
    const subs = await prisma.questionnaireSubmission.findMany({
      where: scopedWhere,
      select: { student: { select: { studentProfile: { select: { id: true } } } } },
      take: 500,
    });
    studentProfileIds = subs
      .map((s) => s.student.studentProfile?.id)
      .filter((id): id is string => Boolean(id));
    studentProfileIds = [...new Set(studentProfileIds)];
  } else if (isInternalStaff) {
    const assignments = await prisma.studentAssignment.findMany({
      where: { assignedToId: userId, isActive: true },
      select: { studentProfileId: true },
      take: 500,
    });
    studentProfileIds = [...new Set(assignments.map((a) => a.studentProfileId))];
  }

  if (studentProfileIds.length === 0) return [];

  const profiles = await prisma.studentProfile.findMany({
    where: { id: { in: studentProfileIds } },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  const profileById = new Map(profiles.map((p) => [p.id, p]));

  for (const profile of profiles) {
    const studentId = profile.user.id;
    const studentName = profile.user.name ?? profile.user.email;
    const link = `/dashboard/students/${studentId}`;

    if (profile.nextFollowUpDate) {
      const days = daysUntil(profile.nextFollowUpDate, now);
      if (days <= FOLLOWUP_OVERDUE_DAYS) {
        addReminder({
          id: `followup-${profile.id}-${profile.nextFollowUpDate.getTime()}`,
          type: "followup",
          title: days < 0 ? "Follow-up overdue" : "Follow-up due",
          description: `${studentName} – ${profile.nextFollowUpDate.toLocaleDateString()}${days < 0 ? ` (${Math.abs(days)} days overdue)` : ""}`,
          studentId,
          studentName,
          link: `${link}#profile`,
          date: profile.nextFollowUpDate,
          severity: days < -3 ? "urgent" : "warning",
        });
      }
    }

    if (profile.visaExpiryDate) {
      const days = daysUntil(profile.visaExpiryDate, now);
      if (days <= VISA_EXPIRY_DAYS) {
        addReminder({
          id: `visa-${profile.id}`,
          type: "visa_expiry",
          title: days < 0 ? "Visa expired" : "Visa expiry soon",
          description: `${studentName} – ${profile.visaExpiryDate.toLocaleDateString()}${days < 0 ? ` (expired)` : ` (${days} days)`}`,
          studentId,
          studentName,
          link: `${link}#profile`,
          date: profile.visaExpiryDate,
          severity: days <= 0 ? "urgent" : days <= 30 ? "warning" : "info",
        });
      }
    }

    if (!isTerminalStage(profile.caseStage)) {
      const stalledDays = -daysUntil(profile.caseStageUpdatedAt, now);
      if (stalledDays >= STAGE_STALLED_WARN_DAYS) {
        addReminder({
          id: `stage-stalled-${profile.id}`,
          type: "stage_stalled",
          title: "Case stage stalled",
          description: `${studentName} has been at "${caseStageLabel(profile.caseStage)}" for ${stalledDays} days`,
          studentId,
          studentName,
          link: `${link}#case-stage`,
          date: profile.caseStageUpdatedAt,
          severity: stalledDays >= STAGE_STALLED_URGENT_DAYS ? "urgent" : "warning",
        });
      }
    }
  }

  const tasks = await prisma.task.findMany({
    where: {
      studentProfileId: { in: studentProfileIds },
      status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
      dueDate: { not: null },
    },
    include: {
      studentProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
    orderBy: { dueDate: "asc" },
    take: 30,
  });

  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() + TASK_DUE_DAYS);

  for (const task of tasks) {
    if (!task.dueDate) continue;
    const days = daysUntil(task.dueDate, now);
    if (days <= TASK_DUE_DAYS) {
      const studentName = task.studentProfile.user.name ?? task.studentProfile.user.email;
      addReminder({
        id: `task-${task.id}`,
        type: "task_due",
        title: days < 0 ? "Task overdue" : "Task due",
        description: `${task.title} – ${studentName} – ${task.dueDate.toLocaleDateString()}`,
        studentId: task.studentProfile.user.id,
        studentName,
        link: `/dashboard/students/${task.studentProfile.user.id}#tasks`,
        date: task.dueDate,
        severity: days < 0 ? "urgent" : days === 0 ? "warning" : "info",
      });
    }
  }

  const contracts = await prisma.contract.findMany({
    where: {
      studentProfileId: { in: studentProfileIds },
      status: "SENT",
    },
    include: {
      studentProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
    take: 20,
  });

  for (const c of contracts) {
    const studentName = c.studentProfile.user.name ?? c.studentProfile.user.email;
    addReminder({
      id: `contract-${c.id}`,
      type: "contract_reminder",
      title: "Contract pending acceptance",
      description: `${c.title} – ${studentName}`,
      studentId: c.studentProfile.user.id,
      studentName,
      link: `/dashboard/contracts/${c.id}/preview`,
      date: c.createdAt,
      severity: "warning",
    });
  }

  const invoices = await prisma.invoice.findMany({
    where: {
      studentProfileId: { in: studentProfileIds },
      status: { in: ["SENT", "OVERDUE"] },
      dueDate: { not: null },
    },
    include: {
      studentProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
    },
    take: 20,
  });

  for (const inv of invoices) {
    if (!inv.dueDate) continue;
    const days = daysUntil(inv.dueDate, now);
    const studentName = inv.studentProfile.user.name ?? inv.studentProfile.user.email;
    addReminder({
      id: `invoice-${inv.id}`,
      type: "invoice_reminder",
      title: days < 0 ? "Invoice overdue" : "Invoice due",
      description: `${inv.title} – ${studentName} – due ${inv.dueDate.toLocaleDateString()}`,
      studentId: inv.studentProfile.user.id,
      studentName,
      link: `/dashboard/invoices/${inv.id}/preview`,
      date: inv.dueDate,
      severity: days < 0 ? "urgent" : days <= 3 ? "warning" : "info",
    });
  }

  reminders.sort((a, b) => a.date.getTime() - b.date.getTime());
  return reminders.slice(0, 20);
});
