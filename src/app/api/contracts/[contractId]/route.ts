import { NextRequest, NextResponse } from "next/server";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { staffCanAccessClientFinancialsByProfileId } from "@/lib/staff-client-access";

type Params = Promise<{ contractId: string }>;

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const { contractId } = await params;

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, studentProfileId: true, status: true },
  });
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (contract.status !== "DRAFT") {
    return NextResponse.json({ error: "Only DRAFT contracts can be edited" }, { status: 400 });
  }

  const canAccess = await staffCanAccessClientFinancialsByProfileId(
    session.user,
    contract.studentProfileId,
  );
  if (!canAccess) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    subject?: string;
    recipientEmail?: string;
    contractDate?: string;
    applicantTitle?: string;
    applicantName?: string;
    applicantCid?: string;
    organizationName?: string;
    hasDependent?: boolean;
    dependentName?: string;
    witnessName?: string;
    witnessCid?: string;
    witnessContact?: string;
    previewHtml?: string;
  };

  const htmlSnapshot = typeof body.previewHtml === "string"
    ? body.previewHtml.slice(0, 500_000)
    : undefined;

  await prisma.contract.update({
    where: { id: contractId },
    data: {
      subject: body.subject ?? undefined,
      recipientEmail: body.recipientEmail ?? undefined,
      contractDate: body.contractDate ?? null,
      applicantTitle: body.applicantTitle ?? null,
      applicantName: body.applicantName ?? null,
      applicantCid: body.applicantCid ?? null,
      organizationName: body.organizationName ?? null,
      hasDependent: body.hasDependent ?? false,
      dependentName: body.dependentName ?? null,
      witnessName: body.witnessName ?? null,
      witnessCid: body.witnessCid ?? null,
      witnessContact: body.witnessContact ?? null,
      ...(htmlSnapshot !== undefined ? { htmlSnapshot } : {}),
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: contract.studentProfileId,
      entityType: "CONTRACT",
      entityId: contractId,
      action: "Saved contract draft via builder",
    },
  });

  return NextResponse.json({ ok: true });
}
