import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type StaffSessionUser = {
  id: string;
  role: string;
};

/** Admin and agents can browse the full active client directory. */
export function staffHasFullClientDirectory(role: string) {
  return role === "ADMIN" || role === "SUB_ADMIN";
}

/** Case managers may act on financial records only for clients on their active team. */
export async function internalStaffHasActiveAssignment(
  staffId: string,
  studentUserId: string,
): Promise<boolean> {
  const assignment = await prisma.studentAssignment.findFirst({
    where: {
      assignedToId: staffId,
      isActive: true,
      studentProfile: { userId: studentUserId },
    },
    select: { id: true },
  });
  return Boolean(assignment);
}

export async function internalStaffHasActiveAssignmentForProfile(
  staffId: string,
  studentProfileId: string,
): Promise<boolean> {
  const assignment = await prisma.studentAssignment.findFirst({
    where: {
      assignedToId: staffId,
      isActive: true,
      studentProfileId,
    },
    select: { id: true },
  });
  return Boolean(assignment);
}

/**
 * Returns true when the staff member may view or change contracts/invoices for
 * the given client. Admins and agents: all clients. Case managers: active team only.
 */
export async function staffCanAccessClientFinancials(
  user: StaffSessionUser,
  studentUserId: string,
): Promise<boolean> {
  if (staffHasFullClientDirectory(user.role)) return true;
  if (user.role !== "INTERNAL_STAFF") return false;
  return internalStaffHasActiveAssignment(user.id, studentUserId);
}

export async function staffCanAccessClientFinancialsByProfileId(
  user: StaffSessionUser,
  studentProfileId: string,
): Promise<boolean> {
  if (staffHasFullClientDirectory(user.role)) return true;
  if (user.role !== "INTERNAL_STAFF") return false;
  return internalStaffHasActiveAssignmentForProfile(user.id, studentProfileId);
}

/**
 * Prisma filter for case-manager client search: current/past team membership or
 * prior case work (tasks, activity, documents uploaded).
 */
export function internalStaffClientDirectoryWhere(staffId: string): Prisma.UserWhereInput {
  return {
    OR: [
      {
        studentProfile: {
          assignments: { some: { assignedToId: staffId } },
        },
      },
      {
        studentProfile: {
          tasks: {
            some: {
              OR: [
                { assigneeId: staffId },
                { assignerId: staffId },
                { completedById: staffId },
              ],
            },
          },
        },
      },
      {
        studentProfile: {
          activities: { some: { actorId: staffId } },
        },
      },
      {
        studentProfile: {
          documents: { some: { uploadedById: staffId } },
        },
      },
    ],
  };
}
