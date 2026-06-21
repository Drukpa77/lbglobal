import type { CaseStage, Prisma, VisaCaseStatus, VisaStatus } from "@prisma/client";

import { runWithUniqueCaseReference } from "@/lib/case-reference";
import { caseStageTerminals } from "@/lib/case-stage";
import { getWorkflowTemplateForVisaService } from "@/lib/workflow-templates";

type DbClient = Prisma.TransactionClient;

type ProfileCaseFields = {
  id: string;
  caseReference: string;
  visaServiceType: string | null;
  otherServiceDescription: string | null;
  caseStage: CaseStage;
  visaStatus: VisaStatus;
  courseStartDate: Date | null;
  courseEndDate: Date | null;
  visaExpiryDate: Date | null;
};

type StartNewVisaCaseInput = {
  studentProfileId: string;
  visaServiceType?: string | null;
  otherServiceDescription?: string | null;
  notes?: string | null;
};

function completedStatusForStage(stage: CaseStage): VisaCaseStatus {
  if (stage === "VISA_GRANTED") return "COMPLETED";
  if (stage === "WITHDRAWN") return "WITHDRAWN";
  return "SUPERSEDED";
}

/**
 * Idempotently materialise the workflow steps for a case from its visa-service
 * template. If the case already has steps, this is a no-op so existing
 * customisations (or a changed visaServiceType) are never overwritten — a fresh
 * template is only applied when a case has no steps yet (creation / lazy
 * backfill of pre-existing cases).
 *
 * The case's `currentStepId` is pointed at the step matching its `caseStage`
 * (terminal stages mark the whole template complete), keeping the synced
 * `caseStage` reporting column and the workflow tile in agreement.
 */
export async function ensureWorkflowStepsForCase(
  client: DbClient,
  visaCase: { id: string; visaServiceType: string | null; caseStage: CaseStage },
): Promise<void> {
  const existingCount = await client.caseWorkflowStep.count({
    where: { visaCaseId: visaCase.id },
  });
  if (existingCount > 0) return;

  const template = getWorkflowTemplateForVisaService(visaCase.visaServiceType);
  if (template.length === 0) return;

  await client.caseWorkflowStep.createMany({
    data: template.map((step, index) => ({
      visaCaseId: visaCase.id,
      position: index,
      label: step.label,
      templateStageKey: step.templateStageKey,
      isCustom: false,
    })),
  });

  const steps = await client.caseWorkflowStep.findMany({
    where: { visaCaseId: visaCase.id },
    orderBy: { position: "asc" },
    select: { id: true, templateStageKey: true },
  });
  if (steps.length === 0) return;

  const isTerminal = caseStageTerminals.includes(visaCase.caseStage);
  const matchIndex = steps.findIndex(
    (step) => step.templateStageKey === visaCase.caseStage,
  );
  // Terminal/outcome stages aren't in the template: treat the whole workflow as
  // done and point at the last step. Otherwise point at the matching step
  // (default to the first when no match, e.g. an unexpected stage value).
  const currentIndex = isTerminal
    ? steps.length - 1
    : matchIndex >= 0
      ? matchIndex
      : 0;

  const completedIds = steps
    .slice(0, isTerminal ? steps.length : currentIndex)
    .map((step) => step.id);
  if (completedIds.length > 0) {
    await client.caseWorkflowStep.updateMany({
      where: { id: { in: completedIds } },
      data: { completedAt: new Date() },
    });
  }

  await client.visaCase.update({
    where: { id: visaCase.id },
    data: { currentStepId: steps[currentIndex]?.id ?? null },
  });
}

export async function ensureVisaCaseFromProfile(
  client: DbClient,
  profile: ProfileCaseFields,
  status: VisaCaseStatus = "ACTIVE",
) {
  const existing = await client.visaCase.findUnique({
    where: { caseReference: profile.caseReference },
    select: { id: true },
  });
  if (existing) {
    if (status === "ACTIVE") {
      await ensureWorkflowStepsForCase(client, {
        id: existing.id,
        visaServiceType: profile.visaServiceType,
        caseStage: profile.caseStage,
      });
    }
    return existing;
  }

  const created = await client.visaCase.create({
    data: {
      studentProfileId: profile.id,
      caseReference: profile.caseReference,
      visaServiceType: profile.visaServiceType,
      otherServiceDescription: profile.otherServiceDescription,
      caseStage: profile.caseStage,
      visaStatus: profile.visaStatus,
      status,
      courseStartDate: profile.courseStartDate,
      courseEndDate: profile.courseEndDate,
      visaExpiryDate: profile.visaExpiryDate,
      completedAt: status === "ACTIVE" ? null : new Date(),
    },
    select: { id: true },
  });

  if (status === "ACTIVE") {
    await ensureWorkflowStepsForCase(client, {
      id: created.id,
      visaServiceType: profile.visaServiceType,
      caseStage: profile.caseStage,
    });
  }

  return created;
}

export async function syncActiveVisaCaseFromProfile(
  client: DbClient,
  profile: ProfileCaseFields,
) {
  const active = await client.visaCase.findFirst({
    where: { studentProfileId: profile.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (!active) {
    await ensureVisaCaseFromProfile(client, profile, "ACTIVE");
    return;
  }

  await client.visaCase.update({
    where: { id: active.id },
    data: {
      caseReference: profile.caseReference,
      visaServiceType: profile.visaServiceType,
      otherServiceDescription: profile.otherServiceDescription,
      caseStage: profile.caseStage,
      visaStatus: profile.visaStatus,
      courseStartDate: profile.courseStartDate,
      courseEndDate: profile.courseEndDate,
      visaExpiryDate: profile.visaExpiryDate,
    },
  });

  // Lazy backfill: existing customised steps are left untouched (idempotent).
  await ensureWorkflowStepsForCase(client, {
    id: active.id,
    visaServiceType: profile.visaServiceType,
    caseStage: profile.caseStage,
  });
}

export async function startNewVisaCaseForProfile(
  client: DbClient,
  input: StartNewVisaCaseInput,
) {
  const profile = await client.studentProfile.findUnique({
    where: { id: input.studentProfileId },
    select: {
      id: true,
      caseReference: true,
      visaServiceType: true,
      otherServiceDescription: true,
      caseStage: true,
      visaStatus: true,
      courseStartDate: true,
      courseEndDate: true,
      visaExpiryDate: true,
    },
  });
  if (!profile) throw new Error("Student profile not found");

  const previousStatus = completedStatusForStage(profile.caseStage);
  await ensureVisaCaseFromProfile(client, profile, previousStatus);
  await client.visaCase.updateMany({
    where: { studentProfileId: profile.id, status: "ACTIVE" },
    data: { status: previousStatus, completedAt: new Date() },
  });

  const nextVisaServiceType = input.visaServiceType?.trim() || profile.visaServiceType;
  const nextOtherServiceDescription = input.otherServiceDescription?.trim() || null;

  return runWithUniqueCaseReference(client, async (caseReference) => {
    const updatedProfile = await client.studentProfile.update({
      where: { id: profile.id },
      data: {
        caseReference,
        visaServiceType: nextVisaServiceType,
        otherServiceDescription: nextOtherServiceDescription,
        caseStage: "CONSULTATION_AND_DOCUMENTATION",
        caseStageUpdatedAt: new Date(),
        visaStatus: "NOT_STARTED",
        courseStartDate: null,
        courseEndDate: null,
        visaExpiryDate: null,
        nextFollowUpDate: null,
        followUpNotes: input.notes?.trim() || null,
      },
      select: {
        id: true,
        caseReference: true,
        visaServiceType: true,
        otherServiceDescription: true,
        caseStage: true,
        visaStatus: true,
        courseStartDate: true,
        courseEndDate: true,
        visaExpiryDate: true,
      },
    });

    const visaCase = await client.visaCase.create({
      data: {
        studentProfileId: updatedProfile.id,
        caseReference: updatedProfile.caseReference,
        visaServiceType: updatedProfile.visaServiceType,
        otherServiceDescription: updatedProfile.otherServiceDescription,
        caseStage: updatedProfile.caseStage,
        visaStatus: updatedProfile.visaStatus,
        status: "ACTIVE",
        notes: input.notes?.trim() || null,
      },
      select: { id: true, caseReference: true },
    });

    await ensureWorkflowStepsForCase(client, {
      id: visaCase.id,
      visaServiceType: updatedProfile.visaServiceType,
      caseStage: updatedProfile.caseStage,
    });

    return { previousStatus, caseReference: visaCase.caseReference };
  });
}
