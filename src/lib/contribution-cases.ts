import type { CaseStage, Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type ContributionCaseSummary = {
  studentProfileId: string;
  caseReference: string;
  displayName: string;
  email: string;
  userId: string;
  caseStage: CaseStage;
};

export async function getContributionCasesForUser(user: {
  id: string;
  role: Role;
}): Promise<ContributionCaseSummary[]> {
  if (user.role === "ADMIN") {
    const profiles = await prisma.studentProfile.findMany({
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { updatedAt: "desc" },
    });
    return profiles.map(toContributionCaseSummary);
  }

  if (user.role === "INTERNAL_STAFF") {
    const assignments = await prisma.studentAssignment.findMany({
      where: { isActive: true, assignedToId: user.id },
      include: {
        studentProfile: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    });
    return assignments.map((row) => toContributionCaseSummary(row.studentProfile));
  }

  if (user.role === "SUB_ADMIN") {
    const submissions = await prisma.questionnaireSubmission.findMany({
      where: {
        OR: [{ assignedToId: user.id }, { assignedToId: null }],
        student: { studentProfile: { isNot: null } },
      },
      select: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            studentProfile: {
              select: {
                id: true,
                caseReference: true,
                caseStage: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const seen = new Set<string>();
    const cases: ContributionCaseSummary[] = [];

    for (const row of submissions) {
      const profile = row.student.studentProfile;
      if (!profile || seen.has(profile.id)) continue;
      seen.add(profile.id);
      cases.push({
        studentProfileId: profile.id,
        caseReference: profile.caseReference,
        displayName: row.student.name ?? row.student.email,
        email: row.student.email,
        userId: row.student.id,
        caseStage: profile.caseStage,
      });
    }

    return cases;
  }

  return [];
}

export async function canViewContributionCase(
  user: { id: string; role: Role },
  studentProfileId: string,
): Promise<boolean> {
  if (user.role === "ADMIN") {
    return prisma.studentProfile.findFirst({
      where: { id: studentProfileId },
      select: { id: true },
    }).then(Boolean);
  }

  if (user.role === "INTERNAL_STAFF") {
    return prisma.studentAssignment.findFirst({
      where: {
        studentProfileId,
        assignedToId: user.id,
        isActive: true,
      },
      select: { id: true },
    }).then(Boolean);
  }

  if (user.role === "SUB_ADMIN") {
    const profile = await prisma.studentProfile.findFirst({
      where: { id: studentProfileId },
      select: {
        user: {
          select: {
            submissions: {
              where: {
                OR: [{ assignedToId: user.id }, { assignedToId: null }],
              },
              select: { id: true },
              take: 1,
            },
          },
        },
      },
    });
    return (profile?.user.submissions.length ?? 0) > 0;
  }

  return false;
}

function toContributionCaseSummary(profile: {
  id: string;
  caseReference: string;
  caseStage: CaseStage;
  user: { id: string; name: string | null; email: string };
}): ContributionCaseSummary {
  return {
    studentProfileId: profile.id,
    caseReference: profile.caseReference,
    displayName: profile.user.name ?? profile.user.email,
    email: profile.user.email,
    userId: profile.user.id,
    caseStage: profile.caseStage,
  };
}
