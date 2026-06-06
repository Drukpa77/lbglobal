import type { CaseStage, Prisma, VisaCaseStatus, VisaStatus } from "@prisma/client";

import { generateNextCaseReference } from "@/lib/case-reference";

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

export async function ensureVisaCaseFromProfile(
  client: DbClient,
  profile: ProfileCaseFields,
  status: VisaCaseStatus = "ACTIVE",
) {
  const existing = await client.visaCase.findUnique({
    where: { caseReference: profile.caseReference },
    select: { id: true },
  });
  if (existing) return existing;

  return client.visaCase.create({
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

  const caseReference = await generateNextCaseReference(client);
  const nextVisaServiceType = input.visaServiceType?.trim() || profile.visaServiceType;
  const nextOtherServiceDescription = input.otherServiceDescription?.trim() || null;

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

  return { previousStatus, caseReference: visaCase.caseReference };
}
