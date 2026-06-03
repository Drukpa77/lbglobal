import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { formatVisaServiceDisplay, resolveVisaServiceType } from "@/lib/visa-services";

export const activeClientUserWhere = {
  role: "USER" as const,
  deletedAt: null,
};

export const deletedClientUserWhere = {
  role: "USER" as const,
  deletedAt: { not: null },
};

export async function softDeleteClient(userId: string, deletedById: string) {
  const now = new Date();
  await prisma.user.updateMany({
    where: { id: userId, role: "USER", deletedAt: null },
    data: { deletedAt: now, deletedById },
  });

  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (profile) {
    await prisma.studentAssignment.updateMany({
      where: { studentProfileId: profile.id, isActive: true },
      data: { isActive: false, endedAt: now },
    });

    await prisma.activityLog.create({
      data: {
        actorId: deletedById,
        targetStudentProfileId: profile.id,
        targetUserId: userId,
        entityType: "STUDENT",
        entityId: userId,
        action: "Moved client to Deleted Clients",
      },
    });
  }

  return profile?.id ?? null;
}

export async function restoreDeletedClient(userId: string, actorId: string) {
  await prisma.user.updateMany({
    where: { id: userId, role: "USER", deletedAt: { not: null } },
    data: { deletedAt: null, deletedById: null },
  });

  const profile = await prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (profile) {
    await prisma.activityLog.create({
      data: {
        actorId,
        targetStudentProfileId: profile.id,
        targetUserId: userId,
        entityType: "STUDENT",
        entityId: userId,
        action: "Restored client from Deleted Clients",
      },
    });
  }
}

export async function permanentDeleteClient(userId: string) {
  await prisma.user.deleteMany({
    where: { id: userId, role: "USER", deletedAt: { not: null } },
  });
}

const deletedClientInclude = {
  deletedBy: { select: { id: true, name: true, email: true } },
  studentProfile: {
    include: {
      documents: {
        orderBy: { createdAt: "desc" as const },
        include: {
          uploadedBy: { select: { name: true, email: true } },
        },
      },
      tasks: {
        orderBy: { createdAt: "desc" as const },
        take: 20,
        include: {
          assignee: { select: { name: true, email: true } },
        },
      },
      assignments: {
        orderBy: { createdAt: "desc" as const },
        include: {
          assignedTo: { select: { name: true, email: true, role: true } },
          assignedBy: { select: { name: true, email: true } },
        },
      },
      contracts: { orderBy: { createdAt: "desc" as const }, take: 5 },
      invoices: { orderBy: { createdAt: "desc" as const }, take: 5 },
    },
  },
  submissions: {
    orderBy: { submittedAt: "desc" as const },
    take: 3,
    include: { template: { select: { title: true } } },
  },
} satisfies Prisma.UserInclude;

export type DeletedClientRecord = Prisma.UserGetPayload<{
  include: typeof deletedClientInclude;
}>;

export async function listDeletedClients() {
  return prisma.user.findMany({
    where: deletedClientUserWhere,
    include: deletedClientInclude,
    orderBy: { deletedAt: "desc" },
    take: 200,
  });
}

export function getDeletedClientServiceLabel(client: DeletedClientRecord) {
  const latestSubmission = client.submissions[0];
  const visaType = resolveVisaServiceType(
    client.studentProfile?.visaServiceType,
    latestSubmission?.answers,
  );
  const label = formatVisaServiceDisplay({
    visaServiceType: visaType,
    otherServiceDescription: client.studentProfile?.otherServiceDescription,
    answers: latestSubmission?.answers,
  });
  return label !== "—" ? label : "Not set";
}

export function revalidateDeletedClientPaths(studentUserId?: string) {
  const paths = [
    "/dashboard/admin",
    "/dashboard/sub-admin",
    "/dashboard/internal-staff",
  ];
  if (studentUserId) {
    paths.push(`/dashboard/students/${studentUserId}`);
  }
  return paths;
}
