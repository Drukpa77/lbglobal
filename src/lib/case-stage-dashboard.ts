import type { Prisma, Role } from "@prisma/client";

export function buildCaseStageProfileWhere(input: {
  role: Role;
  userId: string;
}): Prisma.StudentProfileWhereInput {
  const userScope: Prisma.UserWhereInput = {
    role: "USER",
    deletedAt: null,
  };

  if (input.role !== "ADMIN") {
    userScope.submissions = {
      some: {
        OR: [
          { assignedToId: input.userId },
          { assignedToId: null },
        ],
      },
    };
  }

  return { user: userScope };
}
