import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { canViewContributionCase } from "@/lib/contribution-cases";
import { getContributions } from "@/lib/contributions";

type RouteContext = {
  params: Promise<{ studentProfileId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "SUB_ADMIN" && role !== "INTERNAL_STAFF") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { studentProfileId } = await context.params;
  const allowed = await canViewContributionCase(session.user, studentProfileId);
  if (!allowed) {
    return NextResponse.json({ error: "Case not found" }, { status: 404 });
  }

  const data = await getContributions({ studentProfileId });
  return NextResponse.json({ data }, { status: 200 });
}
