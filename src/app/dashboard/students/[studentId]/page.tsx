import type {
  CaseStage,
  CaseStatus,
  CrmAccountType,
  DocumentVerificationStatus,
  LeadStatus,
  OpportunityForecastCategory,
  OpportunityStage,
  QuoteStatus,
  TaskPriority,
  TaskStatus,
  VisaStatus,
} from "@prisma/client";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";
import type { Session } from "next-auth";
import { Suspense } from "react";
import {
  ArrowLeft,
  ClipboardList,
  FileText,
  History,
  ReceiptText,
  Trophy,
  UserRound,
} from "lucide-react";
import { z } from "zod";

import { ContributionLeaderboard } from "@/components/contribution-leaderboard";
import { DeleteWithConfirm } from "@/components/delete-with-confirm";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { VisaStatusSavedToast } from "@/components/visa-status-saved-toast";
import { StudentNoteItem } from "@/components/student-note-item";
import { ProfileVisaServiceFields } from "@/components/profile-visa-service-fields";
import { SubmitButton } from "@/components/submit-button";
import { DocumentNotificationReadTracker } from "@/components/document-notification-read-tracker";
import { TaskActionToast } from "@/components/task-action-toast";
import { AuditTab } from "@/app/dashboard/students/[studentId]/tabs/audit-tab";
import { TasksDocumentsTab } from "@/app/dashboard/students/[studentId]/tabs/tasks-documents-tab";
import { auth } from "@/auth";
import { blobOpensThroughAuthenticatedApi, getBlobStoreAccess } from "@/lib/blob-access";
import { runWithUniqueCaseReference } from "@/lib/case-reference";
import { getCompanySettings } from "@/lib/company-settings";
import { revalidateContributionsCache } from "@/lib/contributions-cache";
import { getContributions } from "@/lib/contributions";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import {
  enqueueStoredFileCleanup,
  processStoredFileCleanupQueue,
} from "@/lib/stored-file-cleanup";
import { renderTemplate } from "@/lib/template-renderer";
import {
  buildOverviewAssignedTeam,
  completedTaskStatusFilter,
  ensureStaffOnCaseTeam,
  listTaskAssigneeOptions,
  normalizeTaskListView,
  openTaskStatusFilter,
  resolveTaskAssignee,
  executeTaskReassignment,
  taskListOrderBy,
} from "@/lib/task-assignment";
import { softDeleteClient } from "@/lib/deleted-clients";
import { getCurrentClaimOwnerId, notifyClaimOwnerOfClientDeletion } from "@/lib/claims";
import { notifyTaskAssignment } from "@/lib/task-notifications";
import {
  createWorkflowNotification,
  notifyStudentTeamDelegationChange,
} from "@/lib/workflow-notifications";
import {
  formatVisaServiceDisplay,
  getVisaServiceLabel,
  isOtherVisaService,
  isVisaServiceType,
  isStudentVisaService,
  OTHER_SERVICE_DESCRIPTION_KEY,
  resolveVisaServiceType,
  usesStudentClientFields,
  VISA_SERVICE_OPTIONS,
} from "@/lib/visa-services";
import {
  isValidIntakeValue,
  resolveIntakeFromFormData,
} from "@/lib/intake-options";
import {
  ensureVisaCaseFromProfile,
  ensureWorkflowStepsForCase,
  startNewVisaCaseForProfile,
  syncActiveVisaCaseFromProfile,
} from "@/lib/visa-cases";
import {
  CaseStageWorkflowCard,
  type WorkflowSaveResult,
} from "@/components/case-stage-workflow-card";
import { formatVisaStatus, formatYearsLeft, visaStatuses } from "@/lib/student-tracking";
import {
  allCaseStages,
  caseStageLabel,
  caseStageTerminals,
  caseStageTone,
  getCaseStageOrderForVisaService,
  getNextSuggestedStages,
  getStageProgressPercent,
  isCaseStageAllowedForVisaService,
  isTerminalStage,
} from "@/lib/case-stage";

type Params = Promise<{ studentId: string }>;
type SearchParams = Promise<{
  tab?: string;
  taskView?: string;
  taskCreated?: string;
  taskError?: string;
  uploadError?: string;
}>;

const studentProfileTabs = [
  { id: "overview", label: "Overview & Notes", icon: FileText },
  { id: "profile", label: "Profile & Assignment", icon: UserRound },
  { id: "tasks", label: "Tasks & Documents", icon: ClipboardList },
  { id: "financials", label: "Contracts & Invoices", icon: ReceiptText },
  { id: "audit", label: "Audit Log", icon: History },
  { id: "contributions", label: "Contributions", icon: Trophy },
] as const;

function getInitials(value: string) {
  const source = value.includes("@") ? value.split("@")[0] : value;
  const parts = source
    .replace(/[^a-zA-Z0-9\s._-]/g, " ")
    .split(/[\s._-]+/)
    .filter(Boolean);

  if (parts.length === 0) return "CL";

  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const studentAccountSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().email().toLowerCase(),
});

function isPrismaWriteConflict(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "P2034"
  );
}

async function runWorkflowBackfillTransaction(
  callback: (tx: Prisma.TransactionClient) => Promise<void>,
) {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await prisma.$transaction(callback);
      return;
    } catch (error) {
      if (!isPrismaWriteConflict(error) || attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 75));
    }
  }
}

export default async function StudentProfileManagementPage(props: { params: Params; searchParams: SearchParams }) {
  const { studentId } = await props.params;
  const searchParams = await props.searchParams;
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const currentUserId = session.user.id;

  // Placeholders for the disabled `{false && (...)}` sales UI block. The JSX
  // inside still type-checks even though it is never rendered, so we type
  // these arrays to match what Prisma would return — that way the whole
  // dead-code branch stays type-safe without `any` casts.
  type DisabledLead = Prisma.LeadGetPayload<{
    include: {
      account: true;
      owner: { select: { id: true; name: true; email: true; role: true } };
      opportunity: {
        include: {
          quotes: {
            include: {
              submittedBy: { select: { id: true; name: true; email: true } };
              approvedBy: { select: { id: true; name: true; email: true } };
              rejectedBy: { select: { id: true; name: true; email: true } };
            };
          };
          case: true;
        };
      };
    };
  }>;
  const crmAccounts: { id: string; name: string; tag: string | null }[] = [];
  const leadOwners: { id: string; name: string | null; email: string | null; role: string }[] = [];
  const leads: DisabledLead[] = [];

  if (session.user.role === "SUB_ADMIN") {
    const studentExists = await prisma.user.findFirst({
      where: { id: studentId, role: "USER", deletedAt: null },
      select: { id: true },
    });
    if (!studentExists) {
      redirect("/dashboard/sub-admin?tab=students");
    }
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: {
          userId: studentId,
        },
      },
      select: { id: true },
    });
    if (!assigned) {
      redirect("/dashboard/internal-staff");
    }
  }

  const [student, latestSubmission] = await Promise.all([
    prisma.user.findFirst({
      where: { id: studentId, role: "USER", deletedAt: null },
      include: { studentProfile: true },
    }),
    prisma.questionnaireSubmission.findFirst({
      where: { studentId },
      include: { template: true, assignedSubAdmin: true },
      orderBy: { submittedAt: "desc" },
    }),
  ]);

  if (!student) {
    redirect("/dashboard");
  }

  const tabRaw = String(searchParams.tab ?? "overview");
  const activeTab:
    | "overview"
    | "profile"
    | "tasks"
    | "financials"
    | "audit"
    | "contributions" =
    tabRaw === "profile" ||
    tabRaw === "tasks" ||
    tabRaw === "financials" ||
    tabRaw === "audit" ||
    tabRaw === "contributions"
      ? tabRaw
      : "overview";
  const studentProfileId = student.studentProfile?.id ?? "__none__";
  const taskView = normalizeTaskListView(searchParams.taskView);
  const needsOverviewData = activeTab === "overview";
  const needsProfileData = activeTab === "profile";
  const needsTasksData = activeTab === "tasks";
  const needsFinancialData = activeTab === "financials";
  const needsAuditData = activeTab === "audit";
  const needsContributionData = activeTab === "contributions";

  // Fire allDocuments before the main Promise.all so both run in parallel.
  // We keep it separate because TypeScript can't infer the Prisma include type
  // through a conditional ternary inside Promise.all.
  type StudentDocumentWithRelations = Prisma.StudentDocumentGetPayload<{
    include: {
      uploadedBy: { select: { id: true; name: true; email: true } };
      returnedBy: { select: { id: true; name: true; email: true } };
    };
  }>;
  const allDocumentsPromise = needsTasksData
    ? prisma.studentDocument.findMany({
        where: { studentProfileId },
        include: {
          uploadedBy: { select: { id: true, name: true, email: true } },
          returnedBy: { select: { id: true, name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 80,
      })
    : Promise.resolve([] as StudentDocumentWithRelations[]);

  // Fetch all tab-specific data in parallel — independent queries run concurrently
  const [
    contributionData,
    internalStaffUsers,
    delegationTeamUsers,
    currentAssignments,
    internalStaffAssignedForTasks,
    tasks,
    openStudentTaskCount,
    completedStudentTaskCount,
    allDocuments,
    templates,
    contracts,
    invoices,
    conversation,
    recentMessages,
    activityLogs,
    taskAssigneeOptions,
    overviewOpenTasks,
    visaCases,
  ] = await Promise.all([
    needsContributionData && student.studentProfile
      ? getContributions({ studentProfileId })
      : Promise.resolve(null),
    (needsProfileData || needsFinancialData)
      ? prisma.user.findMany({
          where: { role: "INTERNAL_STAFF", deletedAt: null },
          select: { id: true, name: true, email: true },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    needsProfileData
      ? prisma.user.findMany({
          where: { role: { in: ["INTERNAL_STAFF", "SUB_ADMIN"] }, deletedAt: null },
          select: { id: true, name: true, email: true, role: true },
          orderBy: [{ role: "asc" }, { name: "asc" }],
        })
      : Promise.resolve([]),
    studentProfileId !== "__none__"
      ? prisma.studentAssignment.findMany({
          where: { studentProfileId, isActive: true },
          include: {
            assignedTo: { select: { id: true, name: true, email: true, role: true } },
            assignedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    needsTasksData && session.user.role === "INTERNAL_STAFF" && studentProfileId !== "__none__"
      ? prisma.studentAssignment.findFirst({
          where: { studentProfileId, isActive: true, assignedToId: session.user.id },
          select: { id: true },
        })
      : Promise.resolve(null),
    needsTasksData
      ? prisma.task.findMany({
          where: {
            studentProfileId,
            AND: [taskView === "completed" ? completedTaskStatusFilter() : openTaskStatusFilter()],
          },
          include: {
            assignee: { select: { id: true, name: true, email: true } },
            completedBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: taskListOrderBy(taskView),
          take: 30,
        })
      : Promise.resolve([]),
    needsTasksData
      ? prisma.task.count({ where: { studentProfileId, ...openTaskStatusFilter() } })
      : Promise.resolve(0),
    needsTasksData
      ? prisma.task.count({
          where: { studentProfileId, AND: [completedTaskStatusFilter()] },
        })
      : Promise.resolve(0),
    allDocumentsPromise,
    needsFinancialData
      ? prisma.emailTemplate.findMany({
          where: { isActive: true },
          orderBy: [{ type: "asc" }, { createdAt: "desc" }],
          take: 50,
        })
      : Promise.resolve([]),
    needsFinancialData
      ? prisma.contract.findMany({
          where: { studentProfileId },
          include: { createdBy: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    needsFinancialData
      ? prisma.invoice.findMany({
          where: { studentProfileId },
          include: {
            lineItems: true,
            createdBy: { select: { id: true, name: true, email: true } },
          },
          orderBy: { createdAt: "desc" },
          take: 20,
        })
      : Promise.resolve([]),
    needsOverviewData
      ? prisma.conversation.findFirst({
          where: { studentProfileId, type: "STUDENT_THREAD" },
          select: { id: true, title: true },
        })
      : Promise.resolve(null),
    needsOverviewData
      ? prisma.message.findMany({
          where: { conversation: { studentProfileId, type: "STUDENT_THREAD" } },
          include: { sender: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 15,
        })
      : Promise.resolve([]),
    needsAuditData
      ? prisma.activityLog.findMany({
          where: { targetStudentProfileId: studentProfileId },
          include: { actor: { select: { id: true, name: true, email: true } } },
          orderBy: { createdAt: "desc" },
          take: 50,
        })
      : Promise.resolve([]),
    needsTasksData ? listTaskAssigneeOptions() : Promise.resolve([]),
    needsOverviewData && studentProfileId !== "__none__"
      ? prisma.task.findMany({
          where: { studentProfileId, status: { not: "DONE" } },
          select: {
            assignee: { select: { id: true, name: true, email: true, role: true } },
          },
          take: 15,
        })
      : Promise.resolve([]),
    (needsOverviewData || needsProfileData) && studentProfileId !== "__none__"
      ? prisma.visaCase.findMany({
          where: { studentProfileId },
          orderBy: [{ status: "asc" }, { startedAt: "desc" }],
        })
      : Promise.resolve([]),
  ]);

  const canCreateTasks =
    session.user.role === "ADMIN" ||
    session.user.role === "SUB_ADMIN" ||
    Boolean(internalStaffAssignedForTasks);

  const documentsById = new Map(allDocuments.map((doc) => [doc.id, doc]));
  const supersededDocumentIds = new Set(
    allDocuments
      .map((doc) => doc.replacedDocumentId)
      .filter((id): id is string => Boolean(id)),
  );

  const documents = allDocuments
    .filter((doc) => !supersededDocumentIds.has(doc.id))
    .slice(0, 30)
    .map((doc) => {
      const previousVersions: typeof allDocuments = [];
      let cursor = doc.replacedDocumentId ? documentsById.get(doc.replacedDocumentId) : undefined;
      const seen = new Set<string>();
      while (cursor && !seen.has(cursor.id)) {
        seen.add(cursor.id);
        previousVersions.push(cursor);
        cursor = cursor.replacedDocumentId ? documentsById.get(cursor.replacedDocumentId) : undefined;
      }
      return {
        ...doc,
        previousVersions: previousVersions.map((prev) => ({
          id: prev.id,
          title: prev.title,
          storagePath: prev.storagePath,
          verificationStatus: prev.verificationStatus,
          returnedAt: prev.returnedAt,
          returnedNote: prev.returnedNote,
          returnedBy: prev.returnedBy
            ? { name: prev.returnedBy.name, email: prev.returnedBy.email }
            : null,
          uploadedBy: { name: prev.uploadedBy.name, email: prev.uploadedBy.email },
          createdAt: prev.createdAt,
        })),
      };
    });

  const submissionAnswers = needsProfileData ? getAnswerEntries(latestSubmission?.answers) : [];
  const backLink =
    session.user.role === "ADMIN"
      ? "/dashboard/admin"
      : session.user.role === "SUB_ADMIN"
        ? "/dashboard/sub-admin"
        : "/dashboard/internal-staff";
  const profile = student.studentProfile;
  const resolvedVisaServiceType = resolveVisaServiceType(
    profile?.visaServiceType,
    latestSubmission?.answers,
  );
  const serviceTypeLabel = resolvedVisaServiceType
    ? formatVisaServiceDisplay({
        visaServiceType: resolvedVisaServiceType,
        otherServiceDescription: profile?.otherServiceDescription,
        answers: latestSubmission?.answers,
      })
    : "Not set";

  // Editable per-client workflow for the active case. Ensures the active case
  // and its steps exist (lazy backfill for pre-existing clients), then loads
  // the ordered steps + current pointer for the Case Stage tile.
  let workflowCard:
    | {
        caseId: string;
        workflowVersion: string;
        currentStepId: string | null;
        steps: {
          id: string;
          label: string;
          isCustom: boolean;
          hasTemplateAnchor: boolean;
          completed: boolean;
        }[];
        currentStageLabel: string;
        currentStageToneClass: string;
        updatedAt: Date | null;
        isTerminal: boolean;
      }
    | null = null;
  if (needsOverviewData && profile) {
    let activeCase = visaCases.find((visaCase) => visaCase.status === "ACTIVE") ?? null;
    if (!activeCase && visaCases.length === 0) {
      // Truly uninitialised client (no cases yet): create the first active case.
      // Clients whose only cases are completed/withdrawn are left as-is.
      await runWorkflowBackfillTransaction(async (tx) => {
        await ensureVisaCaseFromProfile(tx, profile, "ACTIVE");
      });
      activeCase = await prisma.visaCase.findFirst({
        where: { studentProfileId: profile.id, status: "ACTIVE" },
      });
    } else if (activeCase) {
      await runWorkflowBackfillTransaction(async (tx) => {
        await ensureWorkflowStepsForCase(tx, {
          id: activeCase!.id,
          visaServiceType: activeCase!.visaServiceType,
          caseStage: activeCase!.caseStage,
        });
      });
    }
    if (activeCase) {
      const [stepRows, refreshed] = await Promise.all([
        prisma.caseWorkflowStep.findMany({
          where: { visaCaseId: activeCase.id },
          orderBy: { position: "asc" },
          select: {
            id: true,
            label: true,
            isCustom: true,
            templateStageKey: true,
            completedAt: true,
          },
        }),
        prisma.visaCase.findUnique({
          where: { id: activeCase.id },
          select: { currentStepId: true, caseStage: true, updatedAt: true },
        }),
      ]);
      const currentStage = refreshed?.caseStage ?? profile.caseStage;
      workflowCard = {
        caseId: activeCase.id,
        workflowVersion: (refreshed?.updatedAt ?? activeCase.updatedAt).toISOString(),
        currentStepId: refreshed?.currentStepId ?? null,
        steps: stepRows.map((step) => ({
          id: step.id,
          label: step.label,
          isCustom: step.isCustom,
          hasTemplateAnchor: step.templateStageKey != null,
          completed: step.completedAt != null,
        })),
        currentStageLabel: caseStageLabel(currentStage),
        currentStageToneClass: caseStageTone(currentStage),
        updatedAt: profile.caseStageUpdatedAt,
        isTerminal: isTerminalStage(currentStage),
      };
    }
  }

  const overviewOpenTaskAssignees = overviewOpenTasks.map((task) => task.assignee);
  const assignedTeamForOverview = buildOverviewAssignedTeam({
    assignments: currentAssignments,
    openTaskAssignees: overviewOpenTaskAssignees,
    submissionAgent: latestSubmission?.assignedSubAdmin ?? null,
  });

  const isAssignedCaseManager =
    session.user.role === "INTERNAL_STAFF" &&
    currentAssignments.some((assignment) => assignment.assignedTo.id === session.user.id);
  // Option A + open delegation: any sub-admin may delegate any client so other
  // offices can help when one is flooded. Internal staff need an active
  // delegation. Admins always can.
  const canManageStudentDelegation =
    session.user.role === "ADMIN" ||
    session.user.role === "SUB_ADMIN" ||
    isAssignedCaseManager;
  const activeAssigneeIds = new Set(currentAssignments.map((assignment) => assignment.assignedTo.id));
  const caseManagersForDelegation = delegationTeamUsers.filter(
    (u) => u.role === "INTERNAL_STAFF" && !activeAssigneeIds.has(u.id),
  );
  const agentsForDelegation = delegationTeamUsers.filter(
    (u) => u.role === "SUB_ADMIN" && !activeAssigneeIds.has(u.id),
  );
  const availableDelegationMembers = [
    ...caseManagersForDelegation,
    ...agentsForDelegation,
  ];
  const tabBase = `/dashboard/students/${studentId}`;
  const showDeleteStudentButton =
    session.user.role === "ADMIN" ||
    session.user.role === "SUB_ADMIN" ||
    session.user.role === "INTERNAL_STAFF";
  const clientDisplayName = student.name ?? student.email;
  const caseReferenceLabel = profile?.caseReference ?? "Not assigned";
  const caseReferenceText = `Case Reference: ${caseReferenceLabel}`;
  const clientInitials = getInitials(clientDisplayName);

  return (
    <section className="student-profile-shell text-slate-900">
      <div className="mb-4 rounded-xl border border-slate-200 bg-white/95 p-4 shadow-sm lg:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar aria-hidden="true">
            <AvatarFallback>{clientInitials}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-900" title={clientDisplayName}>
              {clientDisplayName}
            </p>
            <p className="truncate text-xs font-medium text-slate-500" title={caseReferenceText}>
              {caseReferenceText}
            </p>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {showDeleteStudentButton ? (
            <DeleteWithConfirm
              formAction={deleteStudentAction}
              formClassName="block"
              confirmMessage="Move this client to Deleted Clients? Team members can restore them later from the Deleted Clients tab (admins can permanently delete)."
              buttonLabel="Delete Client"
              buttonClassName="inline-flex min-h-10 items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
            >
              <input type="hidden" name="studentId" value={studentId} />
            </DeleteWithConfirm>
          ) : null}
          <Link
            href={backLink}
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Back to Dashboard
          </Link>
        </div>
      </div>

      <nav
        className="student-profile-mobile-tabs sticky top-0 z-10 -mx-4 flex gap-2 overflow-x-auto border-y border-slate-200 bg-slate-100/95 px-4 py-3 backdrop-blur-sm lg:hidden"
        aria-label="Client profile sections"
      >
        {studentProfileTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <Link
              key={tab.id}
              href={`${tabBase}?tab=${tab.id}`}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition",
                isActive
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-200/70 hover:text-slate-900",
              )}
            >
              <Icon aria-hidden="true" />
              {tab.label}
            </Link>
          );
        })}
      </nav>

      <div className="lg:contents">
        <aside className="student-profile-sidebar hidden lg:flex">
          <nav
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            aria-label="Client profile sections"
          >
            <div className="flex min-w-0 items-center gap-3 px-3 py-3">
              <Avatar aria-hidden="true">
                <AvatarFallback>{clientInitials}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900" title={clientDisplayName}>
                  {clientDisplayName}
                </p>
                <p className="truncate text-xs font-medium text-slate-500" title={caseReferenceText}>
                  {caseReferenceText}
                </p>
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-2">
              {studentProfileTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <Link
                    key={tab.id}
                    href={`${tabBase}?tab=${tab.id}`}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition",
                      isActive
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-600 hover:bg-white/55 hover:text-slate-900",
                    )}
                  >
                    <Icon aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate">{tab.label}</span>
                  </Link>
                );
              })}
            </div>
            <div className="space-y-2 p-3">
              <Link
                href={backLink}
                className="flex min-h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
              >
                <ArrowLeft aria-hidden="true" className="h-4 w-4" />
                Back to Dashboard
              </Link>
              {showDeleteStudentButton ? (
                <DeleteWithConfirm
                  formAction={deleteStudentAction}
                  formClassName="block"
                  confirmMessage="Move this client to Deleted Clients? Team members can restore them later from the Deleted Clients tab (admins can permanently delete)."
                  buttonLabel="Delete Client"
                  buttonClassName="flex min-h-10 w-full items-center justify-center rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                >
                  <input type="hidden" name="studentId" value={studentId} />
                </DeleteWithConfirm>
              ) : null}
            </div>
          </nav>
        </aside>

        <div className="min-w-0 space-y-8">
      <Suspense fallback={null}>
        <VisaStatusSavedToast />
      </Suspense>

      {activeTab === "overview" && (
      <>
      <section id="overview" className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Internal Note</h2>
        <p className="mt-1 text-sm text-slate-600">Add a quick note for the internal team. Notes are visible to all staff on this case.</p>
        <form action={addStudentThreadMessageAction} className="mt-4 flex flex-wrap gap-3">
          <input type="hidden" name="studentId" value={studentId} />
          <input
            name="content"
            required
            placeholder="Write a note..."
            className="min-w-72 flex-1 rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
          <SubmitButton
            loadingText="Adding..."
            className="rounded-lg bg-gradient-to-r from-rose-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-70"
          >
            Add note
          </SubmitButton>
        </form>
        {recentMessages.length > 0 ? (
          <div className="mt-4">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Recent notes</p>
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
              {recentMessages.map((message) => (
                <StudentNoteItem
                  key={message.id}
                  message={message}
                  currentUserId={session.user.id}
                  canEditAny={session.user.role === "ADMIN" || session.user.role === "SUB_ADMIN"}
                  studentId={studentId}
                  updateAction={updateStudentNoteAction}
                  deleteAction={deleteStudentNoteAction}
                />
              ))}
            </ul>
          </div>
        ) : null}
        {conversation ? (
          <Link
            href={`/dashboard/communication/${conversation.id}`}
            className="mt-3 inline-block text-sm text-slate-500 hover:text-rose-600"
          >
            Open full thread →
          </Link>
        ) : null}
      </section>

      <div className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Overview</h2>
        <div className="mt-4 grid gap-4 text-base text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Name</p>
            <p className="mt-0.5 font-medium text-slate-900">{student.name ?? "N/A"}</p>
          </div>
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Email</p>
            <p className="mt-0.5 font-medium text-slate-900">{student.email}</p>
          </div>
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Service Type</p>
            <p className="mt-0.5 font-medium text-slate-900">{serviceTypeLabel}</p>
          </div>
          <div className="rounded-lg bg-slate-50/80 p-3 sm:col-span-2">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Assigned team</p>
            {assignedTeamForOverview.length === 0 ? (
              <p className="mt-0.5 font-medium text-slate-900">Unassigned</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {assignedTeamForOverview.map((member) => (
                  <li key={member.id} className="font-medium text-slate-900">
                    {member.name}
                    <span className="ml-2 text-sm font-normal text-slate-500">
                      ({member.roleLabel}
                      {member.helpingViaTask ? " · helping on tasks" : ""})
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Last Submission</p>
            <p className="mt-0.5 font-medium text-slate-900">
              {latestSubmission ? latestSubmission.submittedAt.toLocaleString() : "No submission"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Visa Status</p>
            <p className="mt-0.5 font-medium text-slate-900">
              {profile ? formatVisaStatus(profile.visaStatus) : "Not set"}
            </p>
          </div>
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Years Left</p>
            <p className="mt-0.5 font-medium text-slate-900">{formatYearsLeft(profile?.courseEndDate)}</p>
          </div>
          <div className="rounded-lg bg-slate-50/80 p-3">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Next Follow-up</p>
            <p className="mt-0.5 font-medium text-slate-900">
              {profile?.nextFollowUpDate ? profile.nextFollowUpDate.toLocaleDateString() : "Not set"}
            </p>
          </div>
        </div>
      </div>

      {workflowCard ? (
        <CaseStageWorkflowCard
          studentId={studentId}
          caseId={workflowCard.caseId}
          workflowVersion={workflowCard.workflowVersion}
          steps={workflowCard.steps}
          currentStepId={workflowCard.currentStepId}
          currentStageLabel={workflowCard.currentStageLabel}
          currentStageToneClass={workflowCard.currentStageToneClass}
          updatedAt={workflowCard.updatedAt}
          isTerminal={workflowCard.isTerminal}
          terminalOptions={caseStageTerminals.map((stage) => ({
            value: stage,
            label: caseStageLabel(stage),
          }))}
          hideStudentOnlyNote={!isStudentVisaService(resolvedVisaServiceType)}
          saveAction={saveWorkflowCustomisationsAction}
          outcomeAction={updateCaseStageAction}
        />
      ) : profile && isTerminalStage(profile.caseStage) ? (
        <CaseStageReadOnlyCard
          currentStage={profile.caseStage}
          updatedAt={profile.caseStageUpdatedAt}
        />
      ) : (
        <CaseStageCard
          studentId={studentId}
          visaServiceType={resolvedVisaServiceType}
          currentStage={profile?.caseStage ?? "CONSULTATION_AND_DOCUMENTATION"}
          updatedAt={profile?.caseStageUpdatedAt ?? null}
          action={updateCaseStageAction}
        />
      )}
      {profile ? (
        <VisaCasesSection
          studentId={studentId}
          currentCase={{
            caseReference: profile.caseReference,
            visaServiceType: profile.visaServiceType,
            otherServiceDescription: profile.otherServiceDescription,
            caseStage: profile.caseStage,
            visaStatus: profile.visaStatus,
            visaExpiryDate: profile.visaExpiryDate,
          }}
          visaCases={visaCases}
          action={startNewVisaCaseAction}
        />
      ) : null}
      </>
      )}

      {activeTab === "profile" && (
      <>
      <form id="profile" action={saveStudentProfileAction} className="scroll-mt-24 space-y-6 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <input type="hidden" name="studentId" value={studentId} />
        <h2 className="text-lg font-semibold text-slate-900">Profile Details</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full Name">
            <input
              type="text"
              name="fullName"
              required
              minLength={2}
              maxLength={100}
              defaultValue={student.name ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Email Address">
            <input
              type="email"
              name="email"
              required
              defaultValue={student.email}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Date of Birth">
            <input
              type="date"
              name="dateOfBirth"
              defaultValue={formatDateInput(student.studentProfile?.dateOfBirth)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Phone">
            <input
              type="text"
              name="phone"
              defaultValue={student.studentProfile?.phone ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="City">
            <input
              type="text"
              name="city"
              defaultValue={student.studentProfile?.city ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Nationality">
            <input
              type="text"
              name="nationality"
              defaultValue={student.studentProfile?.nationality ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Current Address" className="sm:col-span-2">
            <textarea
              name="currentAddress"
              defaultValue={student.studentProfile?.currentAddress ?? ""}
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <div className="sm:col-span-2">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Emergency Contact Details
            </h3>
          </div>
          <Field label="Emergency Contact Full Name">
            <input
              type="text"
              name="emergencyContactName"
              defaultValue={student.studentProfile?.emergencyContactName ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Emergency Contact Email Address">
            <input
              type="email"
              name="emergencyContactEmail"
              defaultValue={student.studentProfile?.emergencyContactEmail ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Emergency Contact Phone Number">
            <input
              type="text"
              name="emergencyContactPhone"
              defaultValue={student.studentProfile?.emergencyContactPhone ?? ""}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
            <ProfileVisaServiceFields
              visaServiceType={student.studentProfile?.visaServiceType}
              otherServiceDescription={student.studentProfile?.otherServiceDescription}
              currentEducationLevel={student.studentProfile?.currentEducationLevel}
              targetCourse={student.studentProfile?.targetCourse}
              preferredIntake={student.studentProfile?.preferredIntake}
              englishTestType={student.studentProfile?.englishTestType}
              englishTestScore={student.studentProfile?.englishTestScore}
            />
          </div>
          <Field label="Visa Status">
            <select
              name="visaStatus"
              defaultValue={student.studentProfile?.visaStatus ?? "NOT_STARTED"}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              {visaStatuses.map((status) => (
                <option key={status} value={status}>
                  {formatVisaStatus(status)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Course Start Date">
            <input
              type="date"
              name="courseStartDate"
              defaultValue={formatDateInput(student.studentProfile?.courseStartDate)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Course End Date">
            <input
              type="date"
              name="courseEndDate"
              defaultValue={formatDateInput(student.studentProfile?.courseEndDate)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Visa Expiry Date">
            <input
              type="date"
              name="visaExpiryDate"
              defaultValue={formatDateInput(student.studentProfile?.visaExpiryDate)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Last Follow-up Date">
            <input
              type="date"
              name="lastFollowUpDate"
              defaultValue={formatDateInput(student.studentProfile?.lastFollowUpDate)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
          <Field label="Next Follow-up Date">
            <input
              type="date"
              name="nextFollowUpDate"
              defaultValue={formatDateInput(student.studentProfile?.nextFollowUpDate)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
          </Field>
        </div>
        <Field label="Follow-up Notes">
          <textarea
            name="followUpNotes"
            defaultValue={student.studentProfile?.followUpNotes ?? ""}
            rows={4}
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
          />
        </Field>
        <div className="flex flex-wrap gap-3 border-t border-slate-100 pt-4">
          <SubmitButton
            loadingText="Saving..."
            className="rounded-lg bg-gradient-to-r from-rose-500 to-blue-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition hover:opacity-90 disabled:opacity-70"
          >
            Save Profile
          </SubmitButton>
        </div>
      </form>

      <div className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Questionnaire Answers</h2>
        {submissionAnswers.length === 0 ? (
          <p className="mt-4 text-base text-slate-600">No questionnaire answers found.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {submissionAnswers.map(([key, value]) => (
              <div key={key} className="rounded-lg border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{key}</p>
                <p className="mt-1 text-base text-slate-900">{String(value)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <section className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Delegation & Assigned Team</h2>
        {!canManageStudentDelegation ? (
          <p className="mt-3 text-sm text-slate-600">
            You can view assignments here. Only an admin, agent, or the assigned case manager can change who
            owns this case.
          </p>
        ) : (
          <form action={assignStudentDelegationAction} className="mt-4 flex flex-wrap items-end gap-4">
            <input type="hidden" name="studentId" value={studentId} />
            <div className="block">
              <span className="text-sm font-medium text-slate-700">Add case managers or agents</span>
              <details className="relative mt-1.5 min-w-72">
                <summary className="cursor-pointer list-none rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-base text-slate-900 transition hover:border-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400">
                  Select one or more staff
                </summary>
                <div className="absolute z-20 mt-2 max-h-80 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-3 shadow-lg">
                  {availableDelegationMembers.length === 0 ? (
                    <p className="px-2 py-1 text-sm text-slate-500">All eligible staff are already assigned.</p>
                  ) : null}
                  {caseManagersForDelegation.length > 0 ? (
                    <fieldset className="space-y-2">
                      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Case managers
                      </legend>
                      {caseManagersForDelegation.map((member) => (
                        <label
                          key={member.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-800 transition hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            name="assigneeIds"
                            value={member.id}
                            className="h-4 w-4 rounded border-slate-300 text-rose-500 focus:ring-rose-400"
                          />
                          <span>{member.name ?? member.email}</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : null}
                  {agentsForDelegation.length > 0 ? (
                    <fieldset className={caseManagersForDelegation.length > 0 ? "mt-3 space-y-2" : "space-y-2"}>
                      <legend className="px-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                        Agents
                      </legend>
                      {agentsForDelegation.map((member) => (
                        <label
                          key={member.id}
                          className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-800 transition hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            name="assigneeIds"
                            value={member.id}
                            className="h-4 w-4 rounded border-slate-300 text-rose-500 focus:ring-rose-400"
                          />
                          <span>{member.name ?? member.email}</span>
                        </label>
                      ))}
                    </fieldset>
                  ) : null}
                </div>
              </details>
            </div>
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Notes (optional)</span>
              <input
                name="notes"
                className="mt-1.5 w-64 rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
              />
            </label>
            <button
              type="submit"
              disabled={availableDelegationMembers.length === 0}
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add to team
            </button>
          </form>
        )}
        {currentAssignments.length === 0 ? (
          <p className="mt-4 text-base text-slate-600">No active assignments yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {currentAssignments.map((assignment) => {
              const assigneeLabel = assignment.assignedTo.name ?? assignment.assignedTo.email;
              return (
                <li
                  key={assignment.id}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div>
                    <p className="font-medium text-slate-900">
                      {assigneeLabel}
                      <span className="ml-2 text-sm font-normal text-slate-500">
                        ({assignment.assignedTo.role})
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Assigned by {assignment.assignedBy.name ?? assignment.assignedBy.email} on{" "}
                      {assignment.createdAt.toLocaleDateString()}
                    </p>
                    {assignment.notes ? (
                      <p className="mt-2 text-sm text-slate-600">{assignment.notes}</p>
                    ) : null}
                  </div>
                  {canManageStudentDelegation ? (
                    <DeleteWithConfirm
                      formAction={removeStudentDelegationAction}
                      confirmMessage={`Remove ${assigneeLabel} from this case team?`}
                      buttonLabel="Remove from team"
                      buttonClassName="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
                    >
                      <input type="hidden" name="studentId" value={studentId} />
                      <input type="hidden" name="assignmentId" value={assignment.id} />
                    </DeleteWithConfirm>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
      </>
      )}

      {false && (
      <section id="sales" className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Lead Management Workflow</h2>
        <p className="mt-1 text-sm text-slate-600">
          Progression: New → Contacted → Qualified/Nurture/Disqualified → Converted
        </p>

        <form action={createLeadAction} className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
          <input type="hidden" name="studentId" value={studentId} />
          <p className="font-medium text-slate-900">Create Lead (Salesforce-style intake)</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <input
              name="leadName"
              required
              placeholder="Lead Name"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="phone"
              placeholder="Phone"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              type="email"
              name="email"
              placeholder="Email"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="source"
              placeholder="Source"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="sourceChannel"
              placeholder="Source Channel (e.g. Facebook)"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="campaignName"
              placeholder="Campaign (optional)"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <select
              name="accountSelection"
              defaultValue="CREATE_NEW"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <option value="CREATE_NEW">Create New Account</option>
              <option value="USE_EXISTING">Use Existing Account</option>
            </select>
            <select
              name="existingAccountId"
              defaultValue=""
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <option value="">Existing Account (if selected)</option>
              {crmAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.tag ? ` (${account.tag})` : ""}
                </option>
              ))}
            </select>
            <select
              name="newAccountType"
              defaultValue="STUDENT"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <option value="STUDENT">Client</option>
              <option value="PARENT">Parent/Sponsor</option>
              <option value="PARTNER">Partner</option>
              <option value="INSTITUTION">Institution</option>
            </select>
            <input
              name="newAccountName"
              placeholder="New Account Name (if creating)"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 sm:col-span-2 lg:col-span-2"
            />
            <select
              name="ownerId"
              defaultValue={currentUserId}
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            >
              <option value="">Unassigned owner</option>
              {leadOwners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {(owner.name ?? owner.email) + ` (${owner.role})`}
                </option>
              ))}
            </select>
            <input
              name="nextFollowUpAt"
              type="date"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="leadScore"
              type="number"
              min={0}
              max={100}
              defaultValue={40}
              placeholder="Lead Score (0-100)"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="parentName"
              placeholder="Parent/Sponsor Name"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="parentPhone"
              placeholder="Parent/Sponsor Phone"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <input
              name="parentEmail"
              placeholder="Parent/Sponsor Email"
              className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Create Lead
            </button>
          </div>
        </form>

        {leads.length === 0 ? (
          <p className="mt-4 text-base text-slate-600">No leads yet.</p>
        ) : (
          <div className="mt-4 space-y-4">
            {leads.map((lead) => {
              const opportunity = lead.opportunity;
              const approvedQuoteExists =
                opportunity?.quotes.some((quote) => quote.status === "APPROVED") ?? false;
              const caseActivities = opportunity?.case
                ? activityLogs.filter(
                    (activity) =>
                      activity.entityType === "CASE" && activity.entityId === opportunity.case?.id,
                  )
                : [];

              return (
                <article key={lead.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{lead.name}</p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {lead.email ?? "No email"} · {lead.phone ?? "No phone"} · {lead.source ?? "No source"}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        Account: {lead.account.name} ({formatCrmAccountType(lead.account.accountType)})
                        {lead.account.tag ? ` (${lead.account.tag})` : ""}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        Owner: {lead.owner?.name ?? lead.owner?.email ?? "Unassigned"} · Score:{" "}
                        {lead.leadScore}/100
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        Next Follow-up: {lead.nextFollowUpAt ? lead.nextFollowUpAt.toLocaleDateString() : "Not set"}
                      </p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${leadStatusTone(lead.status)}`}>
                      {formatLeadStatus(lead.status)}
                    </span>
                  </div>

                  <form action={updateLeadQualificationAction} className="mt-3 grid gap-2 sm:grid-cols-4">
                    <input type="hidden" name="studentId" value={studentId} />
                    <input type="hidden" name="leadId" value={lead.id} />
                    <select
                      name="ownerId"
                      defaultValue={lead.ownerId ?? ""}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                    >
                      <option value="">Unassigned owner</option>
                      {leadOwners.map((owner) => (
                        <option key={owner.id} value={owner.id}>
                          {(owner.name ?? owner.email) + ` (${owner.role})`}
                        </option>
                      ))}
                    </select>
                    <input
                      name="leadScore"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={lead.leadScore}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                    />
                    <input
                      name="nextFollowUpAt"
                      type="date"
                      defaultValue={formatDateInput(lead.nextFollowUpAt)}
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                    />
                    <input
                      name="qualificationReason"
                      defaultValue={lead.qualificationReason ?? ""}
                      placeholder="Qualification reason"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                    />
                    <input
                      name="qualificationNotes"
                      defaultValue={lead.qualificationNotes ?? ""}
                      placeholder="Qualification notes"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 sm:col-span-3"
                    />
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-fit"
                    >
                      Save Lead Details
                    </button>
                  </form>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <form action={updateLeadStatusAction}>
                      <input type="hidden" name="studentId" value={studentId} />
                      <input type="hidden" name="leadId" value={lead.id} />
                      <input type="hidden" name="nextStatus" value="CONTACTED" />
                      <button
                        type="submit"
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Mark Contacted
                      </button>
                    </form>
                    <form action={updateLeadStatusAction}>
                      <input type="hidden" name="studentId" value={studentId} />
                      <input type="hidden" name="leadId" value={lead.id} />
                      <input type="hidden" name="nextStatus" value="QUALIFIED" />
                      <button
                        type="submit"
                        className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                      >
                        Qualify
                      </button>
                    </form>
                    <form action={updateLeadStatusAction}>
                      <input type="hidden" name="studentId" value={studentId} />
                      <input type="hidden" name="leadId" value={lead.id} />
                      <input type="hidden" name="nextStatus" value="NURTURE" />
                      <button
                        type="submit"
                        className="rounded-lg border border-amber-200 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50"
                      >
                        Move to Nurture
                      </button>
                    </form>
                    <form action={updateLeadStatusAction}>
                      <input type="hidden" name="studentId" value={studentId} />
                      <input type="hidden" name="leadId" value={lead.id} />
                      <input type="hidden" name="nextStatus" value="DISQUALIFIED" />
                      <button
                        type="submit"
                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                      >
                        Disqualify
                      </button>
                    </form>
                    {lead.status === "QUALIFIED" && !opportunity ? (
                      <form action={convertLeadAction}>
                        <input type="hidden" name="studentId" value={studentId} />
                        <input type="hidden" name="leadId" value={lead.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50"
                        >
                          Convert to Opportunity
                        </button>
                      </form>
                    ) : null}
                  </div>

                  {opportunity ? (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="font-semibold text-slate-900">Opportunity</p>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${opportunityStageTone(opportunity.stage)}`}>
                          {formatOpportunityStage(opportunity.stage)}
                        </span>
                      </div>

                      <form action={updateOpportunityPipelineAction} className="mt-3 grid gap-2 sm:grid-cols-3">
                        <input type="hidden" name="studentId" value={studentId} />
                        <input type="hidden" name="opportunityId" value={opportunity.id} />
                        <input
                          name="name"
                          defaultValue={opportunity.name}
                          placeholder="Opportunity name"
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 sm:col-span-2"
                        />
                        <input
                          name="amount"
                          type="number"
                          min={0}
                          step="0.01"
                          defaultValue={opportunity.amount}
                          placeholder="Amount"
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                        />
                        <input
                          name="probability"
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={opportunity.probability}
                          placeholder="Probability %"
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                        />
                        <input
                          name="expectedCloseDate"
                          type="date"
                          defaultValue={formatDateInput(opportunity.expectedCloseDate)}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                        />
                        <select
                          name="forecastCategory"
                          defaultValue={opportunity.forecastCategory}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                        >
                          <option value="PIPELINE">Pipeline</option>
                          <option value="BEST_CASE">Best Case</option>
                          <option value="COMMIT">Commit</option>
                          <option value="CLOSED">Closed</option>
                        </select>
                        <select
                          name="stage"
                          defaultValue={opportunity.stage}
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                        >
                          <option value="NEW">New</option>
                          <option value="QUOTE_SENT">Quote Sent</option>
                          <option value="CLOSED_WON">Closed Won</option>
                          <option value="CLOSED_LOST">Closed Lost</option>
                        </select>
                        <button
                          type="submit"
                          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:w-fit"
                        >
                          Save Pipeline
                        </button>
                      </form>
                      <p className="mt-2 text-xs text-slate-500">
                        Weighted pipeline value:{" "}
                        {formatMoney("AUD", (opportunity.amount * opportunity.probability) / 100)}
                      </p>

                      <form action={createQuoteAction} className="mt-4 grid gap-2 sm:grid-cols-3">
                        <input type="hidden" name="studentId" value={studentId} />
                        <input type="hidden" name="opportunityId" value={opportunity.id} />
                        <input
                          name="amount"
                          type="number"
                          min={0}
                          step="0.01"
                          required
                          placeholder="Amount"
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                        />
                        <input
                          name="description"
                          placeholder="Description"
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 sm:col-span-2"
                        />
                        <button
                          type="submit"
                          className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 sm:col-span-3 sm:w-fit"
                        >
                          Create Quote
                        </button>
                      </form>

                      {opportunity.quotes.length === 0 ? (
                        <p className="mt-3 text-sm text-slate-600">No quotes yet.</p>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {opportunity.quotes.map((quote) => (
                            <li key={quote.id} className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div>
                                  <p className="text-sm font-medium text-slate-900">
                                    {formatMoney("AUD", quote.amount)} {quote.description ? `· ${quote.description}` : ""}
                                  </p>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    {quote.createdAt.toLocaleString()}
                                  </p>
                                </div>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${quoteStatusTone(quote.status)}`}>
                                  {formatQuoteStatus(quote.status)}
                                </span>
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {quote.status === "DRAFT" ? (
                                  <form action={submitQuoteForApprovalAction}>
                                    <input type="hidden" name="studentId" value={studentId} />
                                    <input type="hidden" name="quoteId" value={quote.id} />
                                    <button
                                      type="submit"
                                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                                    >
                                      Submit for Approval
                                    </button>
                                  </form>
                                ) : null}
                                {quote.status === "SUBMITTED" ? (
                                  <>
                                    <form action={approveQuoteAction} className="flex items-center gap-2">
                                      <input type="hidden" name="studentId" value={studentId} />
                                      <input type="hidden" name="quoteId" value={quote.id} />
                                      <input
                                        name="approvalNotes"
                                        placeholder="Approval notes"
                                        className="rounded-lg border border-emerald-200 px-2 py-1 text-xs text-slate-900 focus:border-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-300"
                                      />
                                      <button
                                        type="submit"
                                        className="rounded-lg border border-emerald-200 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                                      >
                                        Approve
                                      </button>
                                    </form>
                                    <form action={rejectQuoteAction} className="flex items-center gap-2">
                                      <input type="hidden" name="studentId" value={studentId} />
                                      <input type="hidden" name="quoteId" value={quote.id} />
                                      <input
                                        name="approvalNotes"
                                        placeholder="Rejection reason"
                                        className="rounded-lg border border-rose-200 px-2 py-1 text-xs text-slate-900 focus:border-rose-300 focus:outline-none focus:ring-1 focus:ring-rose-300"
                                      />
                                      <button
                                        type="submit"
                                        className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
                                      >
                                        Reject
                                      </button>
                                    </form>
                                  </>
                                ) : null}
                              </div>
                              {(quote.submittedBy || quote.approvedBy || quote.rejectedBy || quote.approvalNotes) ? (
                                <p className="mt-2 text-xs text-slate-500">
                                  {quote.submittedBy
                                    ? `Submitted by ${quote.submittedBy.name ?? quote.submittedBy.email}. `
                                    : ""}
                                  {quote.approvedBy
                                    ? `Approved by ${quote.approvedBy.name ?? quote.approvedBy.email}. `
                                    : ""}
                                  {quote.rejectedBy
                                    ? `Rejected by ${quote.rejectedBy.name ?? quote.rejectedBy.email}. `
                                    : ""}
                                  {quote.approvalNotes ? `Notes: ${quote.approvalNotes}` : ""}
                                </p>
                              ) : null}
                            </li>
                          ))}
                        </ul>
                      )}

                      {approvedQuoteExists && opportunity.stage !== "CLOSED_WON" ? (
                        <form action={closeOpportunityAction} className="mt-3">
                          <input type="hidden" name="studentId" value={studentId} />
                          <input type="hidden" name="opportunityId" value={opportunity.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-emerald-200 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                          >
                            Close Opportunity
                          </button>
                        </form>
                      ) : null}

                      {opportunity.stage === "CLOSED_WON" && !opportunity.case ? (
                        <form action={convertOpportunityToCaseAction} className="mt-3">
                          <input type="hidden" name="studentId" value={studentId} />
                          <input type="hidden" name="opportunityId" value={opportunity.id} />
                          <button
                            type="submit"
                            className="rounded-lg border border-blue-200 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50"
                          >
                            Convert to Case
                          </button>
                        </form>
                      ) : null}

                      {opportunity.case ? (
                        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-slate-900">Case</p>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${caseStatusTone(opportunity.case.status)}`}>
                              {formatCaseStatus(opportunity.case.status)}
                            </span>
                          </div>
                          <form action={updateCaseAction} className="mt-3 grid gap-3 sm:grid-cols-2">
                            <input type="hidden" name="studentId" value={studentId} />
                            <input type="hidden" name="caseId" value={opportunity.case.id} />
                            <input
                              name="title"
                              defaultValue={opportunity.case.title}
                              required
                              placeholder="Case title"
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                            />
                            <select
                              name="status"
                              defaultValue={opportunity.case.status}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                            >
                              <option value="OPEN">Open</option>
                              <option value="IN_PROGRESS">In Progress</option>
                              <option value="RESOLVED">Resolved</option>
                              <option value="CLOSED">Closed</option>
                            </select>
                            <textarea
                              name="description"
                              defaultValue={opportunity.case.description ?? ""}
                              placeholder="Case description"
                              rows={3}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400 sm:col-span-2"
                            />
                            <select
                              name="assignedAgentId"
                              defaultValue={opportunity.case.assignedAgentId ?? ""}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                            >
                              <option value="">Unassigned agent</option>
                              {internalStaffUsers.map((staff) => (
                                <option key={staff.id} value={staff.id}>
                                  {staff.name ?? staff.email}
                                </option>
                              ))}
                            </select>
                            <input
                              name="activityNote"
                              placeholder="Activity note (optional)"
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
                            />
                            <button
                              type="submit"
                              className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 sm:w-fit"
                            >
                              Save Case Update
                            </button>
                          </form>
                          <div className="mt-3">
                            <p className="text-xs font-medium uppercase tracking-wider text-slate-500">Case Activity Log</p>
                            {caseActivities.length === 0 ? (
                              <p className="mt-2 text-sm text-slate-600">No case activity yet.</p>
                            ) : (
                              <ul className="mt-2 space-y-2">
                                {caseActivities.slice(0, 8).map((activity) => (
                                  <li key={activity.id} className="rounded-lg border border-slate-200 bg-white p-3">
                                    <p className="text-sm font-medium text-slate-900">{activity.action}</p>
                                    <p className="mt-0.5 text-xs text-slate-500">
                                      {activity.actor.name ?? activity.actor.email} · {activity.createdAt.toLocaleString()}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </section>
      )}

      {activeTab === "tasks" && (
        <>
          <Suspense fallback={null}>
            <TaskActionToast />
          </Suspense>
          <DocumentNotificationReadTracker studentId={studentId} />
          <TasksDocumentsTab
            studentId={studentId}
            tasks={tasks}
            taskView={taskView}
            openTaskCount={openStudentTaskCount}
            completedTaskCount={completedStudentTaskCount}
            documents={documents}
            taskAssigneeOptions={taskAssigneeOptions}
            createTaskAction={createTaskAction}
            reassignTaskAction={reassignTaskAction}
            updateTaskStatusAction={updateTaskStatusAction}
            updateTaskChecklistAction={updateTaskChecklistAction}
            updateStudentDocumentVerificationAction={updateStudentDocumentVerificationAction}
            disputeStudentDocumentReturnAction={disputeStudentDocumentReturnAction}
            deleteStudentDocumentAction={deleteStudentDocumentAction}
            viewerRole={session.user.role as "ADMIN" | "SUB_ADMIN" | "INTERNAL_STAFF"}
            canCreateTasks={canCreateTasks}
            blobAccess={getBlobStoreAccess()}
            blobOpensThroughAuthenticatedApi={blobOpensThroughAuthenticatedApi()}
          />
        </>
      )}

      {activeTab === "financials" && (
      <section id="financials" className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Contracts & Invoices</h2>
        <p className="mt-2 text-sm text-slate-600">
          Create billing drafts quickly, then open preview to review before sending.
        </p>
        <div className="mt-4 grid gap-6 sm:grid-cols-2">
          <form action={createContractPreviewAction} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-5">
            <input type="hidden" name="studentId" value={studentId} />
            <div>
              <p className="font-semibold text-slate-900">Create Contract</p>
              <p className="mt-1 text-sm text-slate-600">
                Opens the contract builder with a live A4 preview of the Declaration Form. Fill in the applicant details, witness information, and download or send as a PDF.
              </p>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Open Contract Builder
            </button>
          </form>

          <form action={createInvoiceDraftAction} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-5">
            <input type="hidden" name="studentId" value={studentId} />
            <div>
              <p className="font-semibold text-slate-900">Create Invoice</p>
              <p className="mt-1 text-sm text-slate-600">
                Opens the invoice builder with live preview, multi-line items, totals, and PDF download.
              </p>
            </div>
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Open Invoice Builder
            </button>
          </form>
        </div>
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">Contracts</p>
              <p className="text-sm text-slate-500">{contracts.length} total</p>
            </div>
            {contracts.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No contracts yet.</p>
            ) : (
              <ul className="mt-3 max-h-52 space-y-3 overflow-y-auto pr-1">
                {contracts.map((contract) => (
                  <li key={contract.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-900">{contract.title}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${contractStatusTone(contract.status)}`}
                      >
                        {contract.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">Created {contract.createdAt.toLocaleDateString()}</p>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        href={`/dashboard/contracts/${contract.id}/preview`}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Open Preview
                      </Link>
                      <DeleteWithConfirm
                        formAction={deleteContractAction}
                        confirmMessage={`Delete contract "${contract.title}"? This cannot be undone.`}
                        buttonLabel="Delete"
                        buttonClassName="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <input type="hidden" name="contractId" value={contract.id} />
                        <input type="hidden" name="studentId" value={studentId} />
                      </DeleteWithConfirm>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-slate-900">Invoices</p>
              <p className="text-sm text-slate-500">{invoices.length} total</p>
            </div>
            {invoices.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">No invoices yet.</p>
            ) : (
              <ul className="mt-3 max-h-52 space-y-3 overflow-y-auto pr-1">
                {invoices.map((invoice) => (
                  <li key={invoice.id} className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-slate-900">{invoice.invoiceNumber}</p>
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${invoiceStatusTone(invoice.status)}`}
                      >
                        {invoice.status}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {formatMoney(invoice.currency, invoice.totalAmount)}{" "}
                      {invoice.dueDate ? `· Due ${invoice.dueDate.toLocaleDateString()}` : ""}
                    </p>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        href={`/dashboard/invoices/${invoice.id}/preview`}
                        className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Open Preview
                      </Link>
                      <DeleteWithConfirm
                        formAction={deleteInvoiceAction}
                        confirmMessage={`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`}
                        buttonLabel="Delete"
                        buttonClassName="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <input type="hidden" name="studentId" value={studentId} />
                      </DeleteWithConfirm>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
      )}

      {activeTab === "audit" && <AuditTab activityLogs={activityLogs} />}

      {activeTab === "contributions" && (
        contributionData ? (
          <ContributionLeaderboard
            data={contributionData}
            title="Who contributed to this case"
            subtitle="Stages 70% · Documents 15% · Tasks 15% — scoped to this client only."
          />
        ) : (
          <section className="rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Contributions</h2>
            <p className="mt-2 text-sm text-slate-600">
              This student does not have a profile yet, so per-case contribution data is unavailable.
            </p>
          </section>
        )
      )}
        </div>
      </div>
    </section>
  );
}

function Field({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function CaseStageCard({
  studentId,
  visaServiceType,
  currentStage,
  updatedAt,
  action,
}: {
  studentId: string;
  visaServiceType?: string | null;
  currentStage: CaseStage;
  updatedAt: Date | null;
  action: (formData: FormData) => Promise<void>;
}) {
  const workflowStages = getCaseStageOrderForVisaService(visaServiceType);
  const suggestions = getNextSuggestedStages(currentStage, visaServiceType);
  const defaultNext =
    suggestions[0] ??
    (isCaseStageAllowedForVisaService(currentStage, visaServiceType)
      ? currentStage
      : workflowStages[0] ?? currentStage);
  const terminal = isTerminalStage(currentStage);
  const progressPct = getStageProgressPercent(currentStage, visaServiceType);
  const linearIdx = workflowStages.indexOf(currentStage);
  const onWorkflowTrack = linearIdx >= 0;

  return (
    <section
      id="case-stage"
      className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Case Stage</h2>
          <p className="mt-1 text-sm text-slate-600">
            Track this client&apos;s position in the visa workflow.
            {!isStudentVisaService(visaServiceType)
              ? " Enrolment and study-only stages are hidden for this service type."
              : null}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${caseStageTone(currentStage)}`}
        >
          <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />
          {caseStageLabel(currentStage)}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>Linear progress</span>
          <span>
            {terminal
              ? "Outcome"
              : onWorkflowTrack
                ? `Step ${linearIdx + 1} of ${workflowStages.length}`
                : "Outside standard track"}
          </span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full transition-all ${
              terminal && currentStage !== "VISA_GRANTED"
                ? "bg-rose-500"
                : "bg-gradient-to-r from-rose-500 to-blue-500"
            }`}
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {workflowStages.map((stage, idx) => {
            const isCurrent = stage === currentStage;
            const isPast = !terminal && onWorkflowTrack && linearIdx > idx;
            return (
              <span
                key={stage}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                  isCurrent
                    ? caseStageTone(stage)
                    : isPast
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                }`}
              >
                {caseStageLabel(stage)}
              </span>
            );
          })}
        </div>
      </div>

      {updatedAt ? (
        <p className="mt-3 text-xs text-slate-500">
          Stage last updated: {updatedAt.toLocaleString()}
        </p>
      ) : null}

      <form
        action={action}
        className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_auto]"
      >
        <input type="hidden" name="studentId" value={studentId} />
        <select
          name="caseStage"
          defaultValue={defaultNext}
          className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
        >
          <optgroup label="Workflow stages">
            {workflowStages.map((stage) => (
              <option key={stage} value={stage}>
                {caseStageLabel(stage)}
                {suggestions.includes(stage) ? " (suggested)" : ""}
              </option>
            ))}
          </optgroup>
          <optgroup label="Outcomes / end states">
            {caseStageTerminals.map((stage) => (
              <option key={stage} value={stage}>
                {caseStageLabel(stage)}
                {suggestions.includes(stage) ? " (suggested)" : ""}
              </option>
            ))}
          </optgroup>
        </select>
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
        >
          Move to stage
        </button>
        <p className="self-center text-xs text-slate-500 sm:max-w-xs">
          Any-to-any transitions are allowed; the suggested option follows the
          standard workflow.
        </p>
      </form>

    </section>
  );
}

function CaseStageReadOnlyCard({
  currentStage,
  updatedAt,
}: {
  currentStage: CaseStage;
  updatedAt: Date | null;
}) {
  return (
    <section
      id="case-stage"
      className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Case Stage</h2>
          <p className="mt-1 text-sm text-slate-600">
            This case has reached an outcome. Start a new visa case to begin a
            new editable workflow.
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${caseStageTone(currentStage)}`}
        >
          <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />
          {caseStageLabel(currentStage)}
        </span>
      </div>

      <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${
            currentStage === "VISA_GRANTED" ? "bg-emerald-500" : "bg-rose-500"
          }`}
          style={{ width: "100%" }}
        />
      </div>

      {updatedAt ? (
        <p className="mt-3 text-xs text-slate-500">
          Stage last updated: {updatedAt.toLocaleString()}
        </p>
      ) : null}
    </section>
  );
}

function assignmentRoleLabel(role: string) {
  if (role === "SUB_ADMIN") return "Agent";
  if (role === "INTERNAL_STAFF") return "Case manager";
  return role;
}

function formatDateInput(value?: Date | null) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

type VisaCaseRow = {
  id: string;
  caseReference: string;
  visaServiceType: string | null;
  otherServiceDescription: string | null;
  caseStage: CaseStage;
  visaStatus: VisaStatus;
  status: string;
  visaExpiryDate: Date | null;
  startedAt: Date;
  completedAt: Date | null;
  notes: string | null;
};

function VisaCasesSection({
  studentId,
  currentCase,
  visaCases,
  action,
}: {
  studentId: string;
  currentCase: {
    caseReference: string;
    visaServiceType: string | null;
    otherServiceDescription: string | null;
    caseStage: CaseStage;
    visaStatus: VisaStatus;
    visaExpiryDate: Date | null;
  };
  visaCases: VisaCaseRow[];
  action: (formData: FormData) => Promise<void>;
}) {
  const previousCases = visaCases.filter(
    (visaCase) => visaCase.caseReference !== currentCase.caseReference,
  );

  return (
    <section className="scroll-mt-24 rounded-2xl border border-rose-100 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Visa Cases</h2>
          <p className="mt-1 text-sm text-slate-600">
            Keep one client profile while tracking each visa/application as its own case.
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${caseStageTone(currentCase.caseStage)}`}>
          Active: {currentCase.caseReference}
        </span>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Current case</p>
          <p className="mt-1 text-sm font-semibold text-slate-900">{currentCase.caseReference}</p>
          <p className="mt-1 text-sm text-slate-700">
            {formatVisaServiceDisplay({
              visaServiceType: currentCase.visaServiceType,
              otherServiceDescription: currentCase.otherServiceDescription,
            })}
          </p>
          <p className="mt-1 text-xs text-slate-600">
            {caseStageLabel(currentCase.caseStage)} · {formatVisaStatus(currentCase.visaStatus)}
            {currentCase.visaExpiryDate ? ` · Expires ${currentCase.visaExpiryDate.toLocaleDateString()}` : ""}
          </p>
        </article>

        <form action={action} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="studentId" value={studentId} />
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Start new case</p>
          <div className="mt-3 grid gap-2">
            <select
              name="visaServiceType"
              defaultValue={currentCase.visaServiceType ?? ""}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="">Use existing service / decide later</option>
              {VISA_SERVICE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <input
              name="otherServiceDescription"
              placeholder="Service note for Other Services (optional)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            />
            <textarea
              name="notes"
              rows={2}
              placeholder="New case notes (optional)"
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
            />
            <button
              type="submit"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Start New Case
            </button>
          </div>
        </form>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Previous cases</p>
        {previousCases.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No previous visa cases yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {previousCases.map((visaCase) => (
              <li key={visaCase.id} className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{visaCase.caseReference}</p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {formatVisaServiceDisplay({
                        visaServiceType: visaCase.visaServiceType,
                        otherServiceDescription: visaCase.otherServiceDescription,
                      })}{" "}
                      · {caseStageLabel(visaCase.caseStage)} · {formatVisaStatus(visaCase.visaStatus)}
                    </p>
                    {visaCase.notes ? <p className="mt-1 text-xs text-slate-600">{visaCase.notes}</p> : null}
                  </div>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-600">
                    {visaCase.status}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

const QUESTIONNAIRE_ANSWER_LABELS: Record<string, string> = {
  otherServiceDescription: "Service requested",
  visaServiceType: "Service type",
  fullName: "Full name",
  targetCourse: "Target course",
  preferredIntake: "Preferred intake",
  currentEducationLevel: "Current education level",
  englishTestType: "English test type",
  englishTestScore: "English test score",
  hearFrom: "Heard from",
  additionalNote: "Additional note",
};

function formatQuestionnaireAnswerLabel(key: string) {
  return QUESTIONNAIRE_ANSWER_LABELS[key] ?? key.replace(/([A-Z])/g, " $1").trim();
}

function getAnswerEntries(answers?: Prisma.JsonValue) {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) {
    return [] as [string, string | number | boolean | null][];
  }

  return Object.entries(answers as Record<string, string | number | boolean | null>).map(
    ([key, value]) => {
      const label = formatQuestionnaireAnswerLabel(key);
      if (key === "visaServiceType" && typeof value === "string") {
        return [label, getVisaServiceLabel(value)] as const;
      }
      return [label, value] as const;
    },
  );
}

function studentProfileUrl(studentId: string) {
  return `/dashboard/students/${studentId}?tab=profile`;
}

function studentTasksUrl(studentId: string, taskView?: string) {
  return `/dashboard/students/${studentId}?tab=tasks${taskView === "completed" ? "&taskView=completed" : ""}`;
}

function studentFinancialsUrl(studentId: string) {
  return `/dashboard/students/${studentId}?tab=financials`;
}

function studentOverviewCaseStageUrl(studentId: string) {
  return `/dashboard/students/${studentId}?tab=overview#case-stage`;
}

function studentOverviewUrl(studentId: string) {
  return `/dashboard/students/${studentId}?tab=overview`;
}

async function startNewVisaCaseAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const visaServiceTypeRaw = String(formData.get("visaServiceType") ?? "").trim();
  const visaServiceType = visaServiceTypeRaw && isVisaServiceType(visaServiceTypeRaw) ? visaServiceTypeRaw : null;
  const otherServiceDescription = nullableText(formData.get("otherServiceDescription"));
  const notes = nullableText(formData.get("notes"));
  if (!studentId) redirect("/dashboard");

  const result = await prisma.$transaction(async (tx) => {
    const profile = await tx.studentProfile.findUnique({
      where: { userId: studentId },
      select: {
        id: true,
        user: { select: { name: true, email: true } },
      },
    });
    if (!profile) throw new Error("Student profile not found");

    if (session.user.role === "INTERNAL_STAFF") {
      const assignment = await tx.studentAssignment.findFirst({
        where: {
          studentProfileId: profile.id,
          assignedToId: session.user.id,
          isActive: true,
        },
        select: { id: true },
      });
      if (!assignment) throw new Error("Not assigned to this client");
    }

    const newCase = await startNewVisaCaseForProfile(tx, {
      studentProfileId: profile.id,
      visaServiceType,
      otherServiceDescription,
      notes,
    });

    const template = await tx.questionnaireTemplate.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    let submissionId: string | null = null;
    if (template) {
      // Per-client claim: keep the existing owner; only fall back to the acting
      // agent (or unclaimed for internal staff) when nobody owns the client yet.
      const inheritedOwnerId = await getCurrentClaimOwnerId(tx, studentId);
      const submissionOwnerId =
        inheritedOwnerId ?? (session.user.role === "SUB_ADMIN" ? session.user.id : null);
      const submission = await tx.questionnaireSubmission.create({
        data: {
          studentId,
          templateId: template.id,
          assignedToId: submissionOwnerId,
          answers: {
            visaServiceType: visaServiceType ?? "",
            otherServiceDescription: otherServiceDescription ?? "",
            notes: notes ?? "",
            source: "Started from existing client profile",
          },
        },
        select: { id: true },
      });
      submissionId = submission.id;
    }

    await tx.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: profile.id,
        entityType: "CASE_STAGE",
        entityId: profile.id,
        action: `Started new visa case ${newCase.caseReference}`,
        metadata: {
          caseReference: newCase.caseReference,
          visaServiceType,
          previousStatus: newCase.previousStatus,
          submissionId,
        },
      },
    });

    return newCase;
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  redirect(`/dashboard/students/${studentId}?tab=overview#case-stage`);
}

async function saveStudentProfileAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const studentId = String(formData.get("studentId") ?? "");

  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "USER", deletedAt: null },
    select: { id: true },
  });

  if (!student) {
    redirect("/dashboard");
  }

  // Option A: any sub-admin may edit any client (cross-office collaboration).
  // Internal staff are still limited to clients delegated to them.
  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: {
          userId: studentId,
        },
      },
      select: { id: true },
    });
    if (!assigned) {
      redirect(studentProfileUrl(studentId));
    }
  }

  const accountParsed = studentAccountSchema.safeParse({
    fullName: String(formData.get("fullName") ?? ""),
    email: String(formData.get("email") ?? ""),
  });
  if (!accountParsed.success) {
    redirect(studentProfileUrl(studentId));
  }
  const { fullName, email } = accountParsed.data;

  const duplicateEmailUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, role: true },
  });
  if (duplicateEmailUser && duplicateEmailUser.id !== studentId) {
    redirect(studentProfileUrl(studentId));
  }

  await prisma.user.update({
    where: { id: studentId },
    data: { name: fullName, email },
  });

  const dateOfBirthRaw = String(formData.get("dateOfBirth") ?? "").trim();
  const dateOfBirth = parseOptionalDate(dateOfBirthRaw);
  const courseStartDate = parseOptionalDate(String(formData.get("courseStartDate") ?? "").trim());
  const courseEndDate = parseOptionalDate(String(formData.get("courseEndDate") ?? "").trim());
  const visaExpiryDate = parseOptionalDate(String(formData.get("visaExpiryDate") ?? "").trim());
  const lastFollowUpDate = parseOptionalDate(String(formData.get("lastFollowUpDate") ?? "").trim());
  const nextFollowUpDate = parseOptionalDate(String(formData.get("nextFollowUpDate") ?? "").trim());
  const visaStatusRaw = String(formData.get("visaStatus") ?? "NOT_STARTED") as VisaStatus;
  const visaStatus = visaStatuses.includes(visaStatusRaw) ? visaStatusRaw : "NOT_STARTED";
  const visaServiceType = nullableText(formData.get("visaServiceType"));
  const isStudentVisa = usesStudentClientFields(visaServiceType ?? "");
  const isOtherService = isOtherVisaService(visaServiceType ?? "");
  const otherServiceDescription = nullableText(
    formData.get(OTHER_SERVICE_DESCRIPTION_KEY),
  );
  if (
    isOtherService &&
    (!otherServiceDescription ||
      otherServiceDescription.length < 3 ||
      otherServiceDescription.length > 500)
  ) {
    redirect(studentProfileUrl(studentId));
  }
  const profileVisaFields = {
    visaServiceType,
    otherServiceDescription: isOtherService ? otherServiceDescription : null,
    currentEducationLevel: isStudentVisa
      ? nullableText(formData.get("currentEducationLevel"))
      : null,
    targetCourse: isStudentVisa ? nullableText(formData.get("targetCourse")) : null,
    preferredIntake: isStudentVisa
      ? (() => {
          const intake = resolveIntakeFromFormData(formData, "preferredIntake").trim();
          if (!intake) return null;
          if (!isValidIntakeValue(intake)) redirect(studentProfileUrl(studentId));
          return intake;
        })()
      : null,
    englishTestType: nullableText(formData.get("englishTestType")),
    englishTestScore: nullableText(formData.get("englishTestScore")),
  };

  const profileFields = {
    dateOfBirth,
    phone: nullableText(formData.get("phone")),
    city: nullableText(formData.get("city")),
    nationality: nullableText(formData.get("nationality")),
    currentAddress: nullableText(formData.get("currentAddress")),
    emergencyContactName: nullableText(formData.get("emergencyContactName")),
    emergencyContactEmail: nullableText(formData.get("emergencyContactEmail")),
    emergencyContactPhone: nullableText(formData.get("emergencyContactPhone")),
    ...profileVisaFields,
    visaStatus,
    courseStartDate,
    courseEndDate,
    visaExpiryDate,
    lastFollowUpDate,
    nextFollowUpDate,
    followUpNotes: nullableText(formData.get("followUpNotes")),
  };

  const profileSelect = {
    id: true,
    caseReference: true,
    visaServiceType: true,
    otherServiceDescription: true,
    caseStage: true,
    visaStatus: true,
    courseStartDate: true,
    courseEndDate: true,
    visaExpiryDate: true,
  } as const;

  const existingProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });

  const profile = existingProfile
    ? await prisma.studentProfile.update({
        where: { userId: studentId },
        data: profileFields,
        select: profileSelect,
      })
    : await runWithUniqueCaseReference(prisma, (caseReference) =>
        prisma.studentProfile.create({
          data: {
            caseReference,
            userId: studentId,
            ...profileFields,
          },
          select: profileSelect,
        }),
      );

  await prisma.$transaction(async (tx) => {
    await syncActiveVisaCaseFromProfile(tx, profile);
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: profile.id,
      entityType: "STUDENT",
      entityId: studentId,
      action: "Updated client profile (details, visa status, follow-up dates)",
      metadata: { visaStatus },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/student");
  redirect(`/dashboard/students/${studentId}?tab=profile&profileSaved=1`);
}

async function deleteStudentAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) redirect("/login");

  const role = session.user.role;
  if (role !== "ADMIN" && role !== "SUB_ADMIN" && role !== "INTERNAL_STAFF") {
    redirect("/dashboard");
  }

  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) redirect("/dashboard");

  // Option A: any sub-admin may soft-delete any client. Internal staff are
  // still limited to clients delegated to them.
  if (role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: { userId: studentId },
      },
      select: { id: true },
    });
    if (!assigned) redirect("/dashboard/internal-staff");
  }

  await notifyClaimOwnerOfClientDeletion(studentId, session.user.id);
  await softDeleteClient(studentId, session.user.id);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  if (role === "ADMIN") redirect("/dashboard/admin?tab=deleted-clients");
  if (role === "SUB_ADMIN") redirect("/dashboard/sub-admin?tab=deleted-clients");
  redirect("/dashboard/internal-staff?tab=deleted-clients");
}

async function assertStudentDelegationAccess(session: Session, studentId: string) {
  if (!session.user) redirect("/login");

  const returnToProfileTab = studentProfileUrl(studentId);
  const mayDelegate =
    session.user.role === "ADMIN" ||
    session.user.role === "SUB_ADMIN" ||
    session.user.role === "INTERNAL_STAFF";
  if (!mayDelegate) redirect("/dashboard");

  if (session.user.role === "INTERNAL_STAFF") {
    const allowed = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: { userId: studentId },
      },
      select: { id: true },
    });
    if (!allowed) redirect(returnToProfileTab);
  }
  return returnToProfileTab;
}

async function assignStudentDelegationAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const returnToProfileTab = studentId ? studentProfileUrl(studentId) : "/dashboard";

  const assigneeIds = Array.from(
    new Set(
      [
        ...formData.getAll("assigneeIds"),
        formData.get("assigneeId"),
        formData.get("internalStaffId"),
      ]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean),
    ),
  );
  const notes = nullableText(formData.get("notes"));
  if (!studentId || assigneeIds.length === 0) redirect(returnToProfileTab);

  await assertStudentDelegationAccess(session, studentId);

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (!studentProfile) redirect(returnToProfileTab);

  const assignees = await prisma.user.findMany({
    where: { id: { in: assigneeIds }, role: { in: ["INTERNAL_STAFF", "SUB_ADMIN"] }, deletedAt: null },
    select: { id: true, role: true, name: true, email: true },
  });
  const assigneesById = new Map(assignees.map((assignee) => [assignee.id, assignee]));
  const orderedAssignees = assigneeIds
    .map((id) => assigneesById.get(id))
    .filter((assignee): assignee is (typeof assignees)[number] => Boolean(assignee));
  if (orderedAssignees.length === 0) redirect(returnToProfileTab);

  const existingAssignments = await prisma.studentAssignment.findMany({
    where: { studentProfileId: studentProfile.id, assignedToId: { in: orderedAssignees.map((a) => a.id) } },
    select: { id: true, assignedToId: true, isActive: true },
  });
  const existingAssignmentsByAssigneeId = new Map(
    existingAssignments.map((assignment) => [assignment.assignedToId, assignment]),
  );
  const newTeamMembers: typeof orderedAssignees = [];

  const assignedAgent = [...orderedAssignees]
    .reverse()
    .find((assignee) => assignee.role === "SUB_ADMIN");

  await prisma.$transaction(async (tx) => {
    for (const assignee of orderedAssignees) {
      const existingAssignment = existingAssignmentsByAssigneeId.get(assignee.id);
      const isNewTeamMember = !existingAssignment || !existingAssignment.isActive;

      // Upsert on the (studentProfileId, assignedToId) unique key so concurrent
      // delegations can't race into a duplicate-key error.
      await tx.studentAssignment.upsert({
        where: {
          studentProfileId_assignedToId: {
            studentProfileId: studentProfile.id,
            assignedToId: assignee.id,
          },
        },
        update: {
          assignedById: session.user.id,
          notes,
          isActive: true,
          endedAt: null,
        },
        create: {
          studentProfileId: studentProfile.id,
          assignedToId: assignee.id,
          assignedById: session.user.id,
          notes,
          isActive: true,
        },
      });

      await tx.activityLog.create({
        data: {
          actorId: session.user.id,
          targetStudentProfileId: studentProfile.id,
          entityType: "ASSIGNMENT",
          entityId: studentProfile.id,
          action:
            assignee.role === "SUB_ADMIN"
              ? "Assigned client to agent"
              : "Assigned client to case manager",
          metadata: { assigneeId: assignee.id, assigneeRole: assignee.role, notes },
        },
      });

      if (isNewTeamMember) {
        newTeamMembers.push(assignee);
      }
    }

    if (assignedAgent) {
      await tx.questionnaireSubmission.updateMany({
        where: { studentId },
        data: { assignedToId: assignedAgent.id },
      });
    }
  });

  for (const assignee of newTeamMembers) {
    await notifyStudentTeamDelegationChange({
      studentProfileId: studentProfile.id,
      studentUserId: studentId,
      actorId: session.user.id,
      assigneeId: assignee.id,
      assigneeName: assignee.name?.trim() || assignee.email,
      assigneeRole:
        assignee.role === "SUB_ADMIN" ? "SUB_ADMIN" : "INTERNAL_STAFF",
      change: "added",
      delegationNotes: notes,
      source: "student_profile",
    });
  }

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  revalidatePath(`/dashboard/students/${studentId}`);
  revalidateContributionsCache(studentId);
  redirect(returnToProfileTab);
}

async function removeStudentDelegationAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");
  if (!studentId || !assignmentId) {
    redirect(studentId ? studentProfileUrl(studentId) : "/dashboard");
  }

  const returnToProfileTab = await assertStudentDelegationAccess(session, studentId);

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (!studentProfile) redirect(returnToProfileTab);

  const assignment = await prisma.studentAssignment.findFirst({
    where: {
      id: assignmentId,
      studentProfileId: studentProfile.id,
      isActive: true,
    },
    include: {
      assignedTo: { select: { id: true, role: true, name: true, email: true } },
    },
  });
  if (!assignment) redirect(returnToProfileTab);

  const now = new Date();
  await prisma.studentAssignment.update({
    where: { id: assignment.id },
    data: { isActive: false, endedAt: now },
  });

  if (assignment.assignedTo.role === "SUB_ADMIN") {
    await prisma.questionnaireSubmission.updateMany({
      where: { studentId, assignedToId: assignment.assignedTo.id },
      data: { assignedToId: null },
    });
  }

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: studentProfile.id,
      entityType: "ASSIGNMENT",
      entityId: assignment.id,
      action:
        assignment.assignedTo.role === "SUB_ADMIN"
          ? "Removed agent from client delegation"
          : "Removed case manager from client delegation",
      metadata: {
        assigneeId: assignment.assignedTo.id,
        assigneeRole: assignment.assignedTo.role,
      },
    },
  });

  await notifyStudentTeamDelegationChange({
    studentProfileId: studentProfile.id,
    studentUserId: studentId,
    actorId: session.user.id,
    assigneeId: assignment.assignedTo.id,
    assigneeName: assignment.assignedTo.name?.trim() || assignment.assignedTo.email,
    assigneeRole:
      assignment.assignedTo.role === "SUB_ADMIN" ? "SUB_ADMIN" : "INTERNAL_STAFF",
    change: "removed",
    source: "student_profile",
  });

  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  revalidatePath(`/dashboard/students/${studentId}`);
  revalidateContributionsCache(studentId);
  redirect(returnToProfileTab);
}

async function createTaskAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = nullableText(formData.get("description"));
  const priority = String(formData.get("priority") ?? "MEDIUM") as TaskPriority;
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const parsedDueDate = dueDateRaw ? new Date(`${dueDateRaw}T00:00:00`) : null;
  const dueDate = parsedDueDate && !Number.isNaN(parsedDueDate.getTime()) ? parsedDueDate : null;

  if (!studentId) redirect("/dashboard");

  if (!title) {
    redirect(`/dashboard/students/${studentId}?tab=tasks&taskError=missing-title`);
  }

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: {
      id: true,
      assignments: {
        where: { isActive: true },
        select: { assignedToId: true },
      },
    },
  });
  if (!studentProfile) {
    redirect(`/dashboard/students/${studentId}?tab=tasks&taskError=no-profile`);
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const isAssigned = studentProfile.assignments.some(
      (assignment) => assignment.assignedToId === session.user.id,
    );
    if (!isAssigned) {
      redirect(`/dashboard/students/${studentId}?tab=tasks&taskError=not-assigned`);
    }
  }

  // Option A: any sub-admin may manage tasks for any client (collaborative,
  // cross-office). Internal staff remain restricted to delegated clients above.

  const taskPriority: TaskPriority = ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(priority)
    ? priority
    : "MEDIUM";

  const assigneeIdRaw = String(formData.get("assigneeId") ?? "").trim();
  let assignee = await resolveTaskAssignee(assigneeIdRaw);
  if (!assignee) {
    assignee = await resolveTaskAssignee(session.user.id);
  }
  if (!assignee) {
    redirect(`/dashboard/students/${studentId}?tab=tasks&taskError=invalid-assignee`);
  }

  const task = await prisma.task.create({
    data: {
      title,
      description,
      studentProfileId: studentProfile.id,
      assigneeId: assignee.id,
      assignerId: session.user.id,
      priority: taskPriority,
      dueDate,
    },
    select: { id: true },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: studentProfile.id,
      entityType: "TASK",
      entityId: task.id,
      action: `Created task: ${title}`,
      metadata: { assigneeId: assignee.id },
    },
  });

  await notifyTaskAssignment({
    taskId: task.id,
    taskTitle: title,
    studentProfileId: studentProfile.id,
    studentUserId: studentId,
    actorId: session.user.id,
    previousAssigneeId: null,
    newAssigneeId: assignee.id,
    isNewTask: true,
  });

  await ensureStaffOnCaseTeam({
    studentProfileId: studentProfile.id,
    studentUserId: studentId,
    staffId: assignee.id,
    actorId: session.user.id,
    taskTitle: title,
  });

  revalidateContributionsCache(studentId);
  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  redirect(`/dashboard/students/${studentId}?tab=tasks&taskCreated=1`);
}

async function reassignTaskAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const taskId = String(formData.get("taskId") ?? "");
  const assigneeId = String(formData.get("assigneeId") ?? "");
  if (!taskId || !assigneeId) redirect("/dashboard");

  const result = await executeTaskReassignment({
    taskId,
    newAssigneeId: assigneeId,
    actor: { id: session.user.id, role: session.user.role },
  });

  if (!result.ok) {
    redirect("/dashboard");
  }

  revalidatePath(`/dashboard/students/${result.studentUserId}`);
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  redirect(`/dashboard/students/${result.studentUserId}?tab=tasks&taskReassigned=1`);
}

async function updateTaskStatusAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  const taskId = String(formData.get("taskId") ?? "");
  const status = String(formData.get("status") ?? "TODO") as TaskStatus;
  const returnView = String(formData.get("returnView") ?? "");
  const safeStatus: TaskStatus = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].includes(status)
    ? status
    : "TODO";

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      studentProfile: {
        include: {
          assignments: {
            where: { isActive: true },
            select: { assignedToId: true },
          },
        },
      },
    },
  });
  if (!task) redirect("/dashboard");
  const isActiveAssignedTeamMember = task.studentProfile.assignments.some(
    (assignment) => assignment.assignedToId === session.user.id,
  );
  if (
    session.user.role !== "ADMIN" &&
    session.user.id !== task.assigneeId &&
    session.user.id !== task.assignerId &&
    !isActiveAssignedTeamMember
  ) {
    redirect(studentTasksUrl(task.studentProfile.userId));
  }

  await prisma.task.update({
    where: { id: taskId },
    data:
      safeStatus === "DONE"
        ? { status: safeStatus, completedById: session.user.id, completedAt: new Date() }
        : { status: safeStatus, completedById: null, completedAt: null },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: task.studentProfileId,
      entityType: "TASK",
      entityId: taskId,
      action: `Updated task status to ${safeStatus}`,
    },
  });

  revalidateContributionsCache(task.studentProfile.userId);
  revalidatePath(`/dashboard/students/${task.studentProfile.userId}`);
  revalidatePath("/dashboard/internal-staff");
  redirect(studentTasksUrl(task.studentProfile.userId, returnView));
}

async function updateTaskChecklistAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const taskIds = formData
    .getAll("taskIds")
    .map((value) => String(value))
    .filter(Boolean);
  const status = String(formData.get("status") ?? "DONE") as TaskStatus;
  const safeStatus: TaskStatus = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].includes(status)
    ? status
    : "DONE";

  if (!studentId || taskIds.length === 0) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }

  const selectedTasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
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

  const allowedTasks = selectedTasks.filter((task) => {
    if (task.studentProfile.userId !== studentId) return false;
    const isActiveAssignedTeamMember = task.studentProfile.assignments.some(
      (assignment) => assignment.assignedToId === session.user.id,
    );
    return (
      session.user.role === "ADMIN" ||
      session.user.id === task.assigneeId ||
      session.user.id === task.assignerId ||
      isActiveAssignedTeamMember
    );
  });

  if (allowedTasks.length === 0) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }

  const allowedTaskIds = allowedTasks.map((task) => task.id);
  const targetStudentProfileId = allowedTasks[0].studentProfileId;

  await prisma.task.updateMany({
    where: { id: { in: allowedTaskIds } },
    data:
      safeStatus === "DONE"
        ? { status: safeStatus, completedById: session.user.id, completedAt: new Date() }
        : { status: safeStatus, completedById: null, completedAt: null },
  });

  await prisma.activityLog.createMany({
    data: allowedTaskIds.map((taskId) => ({
      actorId: session.user.id,
      targetStudentProfileId,
      entityType: "TASK",
      entityId: taskId,
      action: `Updated task status from checklist to ${safeStatus}`,
    })),
  });

  revalidateContributionsCache(studentId);
  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  redirect(`/dashboard/students/${studentId}?tab=tasks`);
}

async function updateCaseStageAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const stageRaw = String(formData.get("caseStage") ?? "") as CaseStage;
  if (!studentId) redirect("/dashboard");
  if (!allCaseStages.includes(stageRaw)) {
    redirect(studentOverviewCaseStageUrl(studentId));
  }

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: {
      id: true,
      caseReference: true,
      caseStage: true,
      visaStatus: true,
      visaServiceType: true,
      otherServiceDescription: true,
      courseStartDate: true,
      courseEndDate: true,
      visaExpiryDate: true,
      assignments: {
        where: { isActive: true },
        select: { assignedToId: true },
      },
    },
  });
  if (!profile) redirect(studentOverviewCaseStageUrl(studentId));

  if (!isCaseStageAllowedForVisaService(stageRaw, profile.visaServiceType)) {
    redirect(studentOverviewCaseStageUrl(studentId));
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const isAssigned = profile.assignments.some(
      (assignment) => assignment.assignedToId === session.user.id,
    );
    if (!isAssigned) redirect(studentOverviewCaseStageUrl(studentId));
  }

  // Option A: any sub-admin may move the case stage for any client
  // (collaborative, cross-office). Internal staff remain restricted above.

  const previous = profile.caseStage;
  if (previous === stageRaw) {
    redirect(studentOverviewCaseStageUrl(studentId));
  }

  const stageUpdatedAt = new Date();
  const latestSubmission =
    stageRaw === "VISA_GRANTED"
      ? await prisma.questionnaireSubmission.findFirst({
          where: { studentId },
          orderBy: { submittedAt: "desc" },
          select: { id: true },
        })
      : null;

  await prisma.$transaction(async (tx) => {
    const updatedProfile = await tx.studentProfile.update({
      where: { id: profile.id },
      data: {
        caseStage: stageRaw,
        caseStageUpdatedAt: stageUpdatedAt,
        ...(stageRaw === "VISA_GRANTED" ? { visaStatus: "APPROVED" } : {}),
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
    await syncActiveVisaCaseFromProfile(tx, updatedProfile);
    if (stageRaw === "VISA_GRANTED") {
      await tx.visaCase.updateMany({
        where: { studentProfileId: profile.id, status: "ACTIVE" },
        data: { status: "COMPLETED", completedAt: stageUpdatedAt },
      });
    }
    if (latestSubmission) {
      await tx.questionnaireSubmission.update({
        where: { id: latestSubmission.id },
        data: { status: "VISA_GRANTED" },
      });
    }
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: profile.id,
      entityType: "CASE_STAGE",
      entityId: profile.id,
      action: `Moved case stage: ${caseStageLabel(previous)} → ${caseStageLabel(stageRaw)}`,
      metadata: {
        from: previous,
        to: stageRaw,
        ...(stageRaw === "VISA_GRANTED"
          ? {
              syncedVisaStatus: "APPROVED",
              syncedSubmissionStatus: latestSubmission ? "VISA_GRANTED" : null,
            }
          : {}),
      },
    },
  });

  revalidateContributionsCache(studentId);
  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/student");
  redirect(studentOverviewCaseStageUrl(studentId));
}

const workflowProfileSelect = {
  id: true,
  caseReference: true,
  visaServiceType: true,
  otherServiceDescription: true,
  caseStage: true,
  visaStatus: true,
  courseStartDate: true,
  courseEndDate: true,
  visaExpiryDate: true,
} as const;

/**
 * Shared authorization + lookup for the workflow-step editing actions. Returns
 * the resolved profile and active case id, or redirects on any failure.
 * Case managers (INTERNAL_STAFF) must be assigned to the client; sub-admins and
 * admins may edit any client's workflow.
 */
async function loadWorkflowActionContext(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");
  if (!studentId || !caseId) redirect("/dashboard");

  const profile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: {
      ...workflowProfileSelect,
      assignments: {
        where: { isActive: true },
        select: { assignedToId: true },
      },
      visaCases: {
        where: { id: caseId, status: "ACTIVE" },
        select: { id: true, currentStepId: true, updatedAt: true },
      },
    },
  });
  if (!profile) redirect(studentOverviewCaseStageUrl(studentId));

  if (session.user.role === "INTERNAL_STAFF") {
    const isAssigned = profile.assignments.some(
      (assignment) => assignment.assignedToId === session.user.id,
    );
    if (!isAssigned) redirect(studentOverviewCaseStageUrl(studentId));
  }

  const activeCase = profile.visaCases[0];
  if (!activeCase) redirect(studentOverviewCaseStageUrl(studentId));

  return { session, studentId, caseId, profile, activeCase };
}

/**
 * Recompute the case's derived state after a structural change: mark steps
 * before the current step complete, point `currentStepId` at a valid step, and
 * sync the reporting `caseStage` to the current step's template anchor (the
 * nearest preceding template-keyed step when the current step is custom).
 */
async function recomputeWorkflowDerivedState(
  tx: Prisma.TransactionClient,
  params: {
    profileId: string;
    caseId: string;
    desiredCurrentStepId: string | null;
    currentCaseStage: CaseStage;
  },
) {
  const steps = await tx.caseWorkflowStep.findMany({
    where: { visaCaseId: params.caseId },
    orderBy: { position: "asc" },
    select: { id: true, position: true, label: true, templateStageKey: true },
  });
  if (steps.length === 0) return;

  let currentId = params.desiredCurrentStepId;
  if (!currentId || !steps.some((step) => step.id === currentId)) {
    currentId = steps[0].id;
  }
  const currentIdx = steps.findIndex((step) => step.id === currentId);

  const completedIds = steps.slice(0, currentIdx).map((step) => step.id);
  const pendingIds = steps.slice(currentIdx).map((step) => step.id);
  if (completedIds.length > 0) {
    await tx.caseWorkflowStep.updateMany({
      where: { id: { in: completedIds } },
      data: { completedAt: new Date() },
    });
  }
  if (pendingIds.length > 0) {
    await tx.caseWorkflowStep.updateMany({
      where: { id: { in: pendingIds } },
      data: { completedAt: null },
    });
  }

  // Anchor rule: current step's template key, else nearest preceding template
  // key, else the first template-keyed step in the list.
  let anchor: CaseStage | null = steps[currentIdx].templateStageKey;
  if (!anchor) {
    for (let i = currentIdx - 1; i >= 0; i -= 1) {
      if (steps[i].templateStageKey) {
        anchor = steps[i].templateStageKey;
        break;
      }
    }
  }
  if (!anchor) {
    anchor = steps.find((step) => step.templateStageKey)?.templateStageKey ?? null;
  }

  if (anchor) {
    const stageChanged = anchor !== params.currentCaseStage;
    const updatedProfile = await tx.studentProfile.update({
      where: { id: params.profileId },
      data: {
        caseStage: anchor,
        ...(stageChanged ? { caseStageUpdatedAt: new Date() } : {}),
      },
      select: workflowProfileSelect,
    });
    await tx.visaCase.update({
      where: { id: params.caseId },
      data: {
        currentStepId: currentId,
        caseReference: updatedProfile.caseReference,
        visaServiceType: updatedProfile.visaServiceType,
        otherServiceDescription: updatedProfile.otherServiceDescription,
        caseStage: updatedProfile.caseStage,
        visaStatus: updatedProfile.visaStatus,
        courseStartDate: updatedProfile.courseStartDate,
        courseEndDate: updatedProfile.courseEndDate,
        visaExpiryDate: updatedProfile.visaExpiryDate,
      },
    });
  } else {
    await tx.visaCase.update({
      where: { id: params.caseId },
      data: { currentStepId: currentId },
    });
  }

  return {
    currentId,
    anchor,
    currentStepLabel: steps[currentIdx]?.label ?? null,
  };
}

function revalidateWorkflowViews(studentId: string) {
  revalidateContributionsCache(studentId);
  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/student");
}

async function saveWorkflowCustomisationsAction(
  formData: FormData,
): Promise<WorkflowSaveResult> {
  "use server";
  const { session, studentId, caseId, profile, activeCase } =
    await loadWorkflowActionContext(formData);

  const rawSteps = String(formData.get("steps") ?? "");
  const currentStepDraftId = String(formData.get("currentStepDraftId") ?? "");
  const workflowVersionRaw = String(formData.get("workflowVersion") ?? "");
  const workflowVersion = new Date(workflowVersionRaw);
  if (!workflowVersionRaw || Number.isNaN(workflowVersion.getTime())) {
    return { ok: false, error: "The workflow version is invalid. Refresh and try again." };
  }
  let parsedSteps: unknown;
  try {
    parsedSteps = JSON.parse(rawSteps);
  } catch {
    return { ok: false, error: "The workflow data is invalid. Refresh and try again." };
  }
  if (!Array.isArray(parsedSteps) || parsedSteps.length === 0) {
    return { ok: false, error: "A workflow must contain at least one stage." };
  }

  const requestedSteps = parsedSteps
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const draftId = typeof row.draftId === "string" ? row.draftId.trim() : "";
      const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : null;
      const label = typeof row.label === "string" ? row.label.trim() : "";
      if (!draftId || !label || label.length > 120) return null;
      return { draftId, id, label };
    })
    .filter((step): step is { draftId: string; id: string | null; label: string } =>
      Boolean(step),
    );
  if (
    requestedSteps.length === 0 ||
    requestedSteps.length !== parsedSteps.length
  ) {
    return { ok: false, error: "The workflow contains an invalid stage." };
  }

  const draftIds = new Set(requestedSteps.map((step) => step.draftId));
  if (draftIds.size !== requestedSteps.length) {
    return { ok: false, error: "The workflow contains duplicate stages." };
  }

  const existing = await prisma.caseWorkflowStep.findMany({
    where: { visaCaseId: caseId },
    select: { id: true, position: true, label: true, templateStageKey: true },
  });
  const existingById = new Map(existing.map((step) => [step.id, step]));
  const previousCurrentStep = activeCase.currentStepId
    ? existingById.get(activeCase.currentStepId)
    : null;
  const requestedExistingIds = requestedSteps
    .map((step) => step.id)
    .filter((id): id is string => Boolean(id));
  if (
    requestedExistingIds.length !== new Set(requestedExistingIds).size ||
    !requestedExistingIds.every((id) => existingById.has(id))
  ) {
    return {
      ok: false,
      error: "This workflow changed while you were editing it. Refresh and try again.",
    };
  }

  const keepsTemplateAnchor = requestedExistingIds.some(
    (id) => existingById.get(id)?.templateStageKey != null,
  );
  if (!keepsTemplateAnchor) {
    return { ok: false, error: "At least one standard workflow stage must remain." };
  }

  let desiredCurrentStepId = activeCase.currentStepId;
  let workflowResult:
    | Awaited<ReturnType<typeof recomputeWorkflowDerivedState>>
    | undefined;
  const transactionResult = await prisma.$transaction(
    async (tx) => {
      const transactionStartedAt = new Date();
      const versionClaim = await tx.visaCase.updateMany({
        where: {
          id: caseId,
          status: "ACTIVE",
          updatedAt: workflowVersion,
        },
        data: { updatedAt: transactionStartedAt },
      });
      if (versionClaim.count !== 1) {
        return { conflict: true as const };
      }

      const persistedDraftToId = new Map<string, string>();
      const requestedExistingIdSet = new Set(requestedExistingIds);
      const removedExistingIds = existing
        .filter((step) => !requestedExistingIdSet.has(step.id))
        .map((step) => step.id);

      if (removedExistingIds.length > 0) {
        await tx.caseWorkflowStep.deleteMany({
          where: { id: { in: removedExistingIds }, visaCaseId: caseId },
        });
      }

      const changedExistingSteps = requestedSteps.flatMap((step, position) => {
        if (!step.id) return [];
        persistedDraftToId.set(step.draftId, step.id);
        const previous = existingById.get(step.id);
        return previous &&
          (previous.position !== position || previous.label !== step.label)
          ? [{ id: step.id, position, label: step.label }]
          : [];
      });

      if (changedExistingSteps.length > 0) {
        const positionCases = Prisma.join(
          changedExistingSteps.map(
            (step) => Prisma.sql`WHEN ${step.id} THEN ${step.position}`,
          ),
          " ",
        );
        const labelCases = Prisma.join(
          changedExistingSteps.map(
            (step) => Prisma.sql`WHEN ${step.id} THEN ${step.label}`,
          ),
          " ",
        );
        const changedIds = Prisma.join(
          changedExistingSteps.map((step) => step.id),
        );

        await tx.$executeRaw(Prisma.sql`
          UPDATE \`CaseWorkflowStep\`
          SET
            \`position\` = CASE \`id\` ${positionCases} ELSE \`position\` END,
            \`label\` = CASE \`id\` ${labelCases} ELSE \`label\` END,
            \`updatedAt\` = ${transactionStartedAt}
          WHERE \`visaCaseId\` = ${caseId}
            AND \`id\` IN (${changedIds})
        `);
      }

      for (let index = 0; index < requestedSteps.length; index += 1) {
        const step = requestedSteps[index];
        if (step.id) continue;
        const created = await tx.caseWorkflowStep.create({
          data: {
            visaCaseId: caseId,
            position: index,
            label: step.label,
            templateStageKey: null,
            isCustom: true,
          },
          select: { id: true },
        });
        persistedDraftToId.set(step.draftId, created.id);
      }

      desiredCurrentStepId =
        persistedDraftToId.get(currentStepDraftId) ??
        (requestedExistingIdSet.has(activeCase.currentStepId ?? "")
          ? activeCase.currentStepId
          : null);

      workflowResult = await recomputeWorkflowDerivedState(tx, {
        profileId: profile.id,
        caseId,
        desiredCurrentStepId,
        currentCaseStage: profile.caseStage,
      });

      return { conflict: false as const };
    },
    { maxWait: 5_000, timeout: 15_000 },
  );

  if (transactionResult.conflict) {
    return {
      ok: false,
      error:
        "Another staff member updated this workflow while you were editing it. Refresh and try again.",
    };
  }

  const nextReportingStage = workflowResult?.anchor ?? null;
  const reportingStageChanged =
    nextReportingStage !== null && nextReportingStage !== profile.caseStage;

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: profile.id,
      entityType: "CASE_STAGE",
      entityId: profile.id,
      action: reportingStageChanged
        ? `Saved workflow customisations and moved reporting stage: ${caseStageLabel(profile.caseStage)} -> ${caseStageLabel(nextReportingStage)}`
        : "Saved workflow customisations",
      metadata: {
        caseId,
        stepCount: requestedSteps.length,
        previousCurrentStepId: activeCase.currentStepId,
        previousCurrentStepLabel: previousCurrentStep?.label ?? null,
        currentStepId: desiredCurrentStepId,
        currentStepLabel: workflowResult?.currentStepLabel ?? null,
        contributionRule: "template_anchor_stage_delta_only",
        ...(reportingStageChanged
          ? {
              from: profile.caseStage,
              to: nextReportingStage,
            }
          : {}),
      },
    },
  });

  revalidateWorkflowViews(studentId);
  return { ok: true };
}

async function updateStudentDocumentVerificationAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    redirect("/login");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const mode = String(formData.get("mode") ?? "").trim();
  const statusRaw = String(formData.get("status") ?? "PENDING") as DocumentVerificationStatus;
  const note = String(formData.get("note") ?? "").trim();
  const status: DocumentVerificationStatus = ["PENDING", "VERIFIED", "REJECTED"].includes(statusRaw)
    ? statusRaw
    : "PENDING";

  if (!studentId || !documentId) redirect(`/dashboard/students/${studentId}?tab=tasks`);

  const document = await prisma.studentDocument.findUnique({
    where: { id: documentId },
    include: {
      studentProfile: {
        select: {
          id: true,
          userId: true,
          assignments: {
            where: { isActive: true },
            select: { assignedToId: true },
          },
          user: { select: { name: true, email: true } },
        },
      },
      returnedBy: { select: { id: true } },
      verifiedBy: { select: { id: true, role: true } },
    },
  });
  if (!document || document.studentProfile.userId !== studentId) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const isAssigned = document.studentProfile.assignments.some(
      (assignment) => assignment.assignedToId === session.user.id,
    );
    if (!isAssigned) redirect(studentTasksUrl(studentId));
  }

  if (session.user.role === "SUB_ADMIN") {
    const isReverse = mode === "reverse";
    if (!isReverse) redirect(studentTasksUrl(studentId));
    if (document.verificationStatus !== "VERIFIED") redirect(`/dashboard/students/${studentId}?tab=tasks`);
    if (!["PENDING", "REJECTED"].includes(status) || !note) {
      redirect(`/dashboard/students/${studentId}?tab=tasks`);
    }

    const returnedAt = new Date();
    await prisma.studentDocument.update({
      where: { id: document.id },
      data: {
        verificationStatus: status,
        notes: note,
        returnedById: session.user.id,
        returnedAt,
        returnedNote: note,
        returnResolvedAt: null,
      },
    });

    if (document.verifiedBy && document.verifiedBy.role === "INTERNAL_STAFF") {
      await createWorkflowNotification({
        recipientId: document.verifiedBy.id,
        actorId: session.user.id,
        studentProfileId: document.studentProfileId,
        documentId: document.id,
        type: "DOCUMENT_RETURNED",
        title: "Document verification returned",
        message: `${document.studentProfile.user.name ?? document.studentProfile.user.email} - ${document.title} was returned to ${status}`,
        note,
        link: `/dashboard/students/${studentId}?tab=tasks`,
        actionRequired: true,
        metadata: { fromStatus: "VERIFIED", toStatus: status },
      });
    }

    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: document.studentProfileId,
        targetUserId: document.verifiedBy?.id ?? null,
        entityType: "DOCUMENT",
        entityId: document.id,
        action: `Returned verified document to ${status}`,
        metadata: { note, previousStatus: "VERIFIED", status },
      },
    });
  } else {
    await prisma.studentDocument.update({
      where: { id: document.id },
      data: {
        verificationStatus: status,
        notes: note || null,
        verifiedById: status === "VERIFIED" ? session.user.id : document.verifiedById,
        verifiedAt: status === "VERIFIED" ? new Date() : document.verifiedAt,
        returnResolvedAt:
          document.returnedAt && document.returnResolvedAt === null ? new Date() : document.returnResolvedAt,
      },
    });

    if (
      session.user.role === "INTERNAL_STAFF" &&
      status === "VERIFIED" &&
      document.returnedAt &&
      document.returnedById &&
      document.returnResolvedAt === null
    ) {
      await createWorkflowNotification({
        recipientId: document.returnedById,
        actorId: session.user.id,
        studentProfileId: document.studentProfileId,
        documentId: document.id,
        type: "DOCUMENT_REVERIFIED",
        title: "Returned document re-verified",
        message: `${document.studentProfile.user.name ?? document.studentProfile.user.email} - ${document.title} has been re-verified`,
        note: note || null,
        link: `/dashboard/students/${studentId}?tab=tasks`,
        actionRequired: true,
      });
    }

    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: document.studentProfileId,
        entityType: "DOCUMENT",
        entityId: document.id,
        action: `Set document verification status to ${status}`,
        metadata: note ? { note } : undefined,
      },
    });
  }

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  redirect(`/dashboard/students/${studentId}?tab=tasks`);
}

async function disputeStudentDocumentReturnAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "INTERNAL_STAFF" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!studentId || !documentId || !note) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }

  const document = await prisma.studentDocument.findUnique({
    where: { id: documentId },
    include: {
      studentProfile: {
        select: {
          id: true,
          userId: true,
          assignments: { where: { isActive: true }, select: { assignedToId: true } },
          user: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!document || document.studentProfile.userId !== studentId || !document.returnedById) {
    redirect(`/dashboard/students/${studentId}?tab=tasks`);
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const isAssigned = document.studentProfile.assignments.some(
      (assignment) => assignment.assignedToId === session.user.id,
    );
    if (!isAssigned) redirect(studentTasksUrl(studentId));
  }

  await prisma.studentDocument.update({
    where: { id: document.id },
    data: {
      returnResolvedAt: new Date(),
      notes: note,
    },
  });

  await createWorkflowNotification({
    recipientId: document.returnedById,
    actorId: session.user.id,
    studentProfileId: document.studentProfileId,
    documentId: document.id,
    type: "DOCUMENT_RETURN_DISPUTED",
    title: "Return disputed by internal staff",
    message: `${document.studentProfile.user.name ?? document.studentProfile.user.email} - ${document.title}`,
    note,
    link: `/dashboard/students/${studentId}?tab=tasks`,
    actionRequired: true,
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: document.studentProfileId,
      targetUserId: document.returnedById,
      entityType: "DOCUMENT",
      entityId: document.id,
      action: "Disputed returned document",
      metadata: { note },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  redirect(`/dashboard/students/${studentId}?tab=tasks`);
}

async function deleteStudentDocumentAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    redirect("/login");
  }
  const studentId = String(formData.get("studentId") ?? "");
  const documentId = String(formData.get("documentId") ?? "");
  const doc = await prisma.studentDocument.findUnique({
    where: { id: documentId },
    select: { id: true, storagePath: true, studentProfileId: true },
  });
  if (!doc) redirect(`/dashboard/students/${studentId}?tab=tasks`);

  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfileId: doc.studentProfileId,
      },
      select: { id: true },
    });
    if (!assigned) {
      redirect(studentTasksUrl(studentId));
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.studentDocument.delete({ where: { id: doc.id } });
    await tx.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: doc.studentProfileId,
        entityType: "DOCUMENT",
        entityId: doc.id,
        action: "Deleted student document",
      },
    });
    await enqueueStoredFileCleanup(
      {
        storagePath: doc.storagePath,
        sourceType: "StudentDocument",
        sourceId: doc.id,
      },
      tx,
    );
  });

  after(async () => {
    await processStoredFileCleanupQueue({ batchSize: 1 });
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}?tab=tasks`);
}

async function createContractPreviewAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    redirect("/login");
  }
  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) redirect("/dashboard");

  // Option A: any sub-admin may act on any client; internal staff are limited
  // to clients delegated to them.
  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: { userId: studentId },
      },
      select: { id: true },
    });
    if (!assigned) redirect(studentFinancialsUrl(studentId));
  }

  const [student, companySettings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      include: { studentProfile: true },
    }),
    getCompanySettings(),
  ]);
  if (!student?.studentProfile) redirect(studentFinancialsUrl(studentId));

  const contractNumber = `CTR-${Date.now().toString().slice(-8)}`;
  const studentName = student.name ?? student.email;
  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  const contract = await prisma.contract.create({
    data: {
      studentProfileId: student.studentProfile.id,
      createdById: session.user.id,
      contractNumber,
      title: `Declaration Form - ${studentName}`,
      subject: `Declaration Form for Submission of Documents — ${studentName}`,
      recipientEmail: student.email,
      htmlSnapshot: "",
      contractDate: today,
      applicantName: studentName,
      organizationName: companySettings.companyName,
      hasDependent: false,
      status: "DRAFT",
    },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: student.studentProfile.id,
      entityType: "CONTRACT",
      entityId: contract.id,
      action: "Created contract draft via builder",
    },
  });
  redirect(`/dashboard/contracts/${contract.id}/preview`);
}

async function createInvoiceDraftAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    redirect("/login");
  }
  const studentId = String(formData.get("studentId") ?? "");
  if (!studentId) redirect("/dashboard");

  // Option A: any sub-admin may act on any client; internal staff are limited
  // to clients delegated to them.
  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: { userId: studentId },
      },
      select: { id: true },
    });
    if (!assigned) redirect(studentFinancialsUrl(studentId));
  }

  const [student, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      include: { studentProfile: true },
    }),
    getCompanySettings(),
  ]);
  if (!student || !student.studentProfile) redirect(studentFinancialsUrl(studentId));

  const invoiceNumber = `${settings.invoicePrefix}${Date.now()}`;
  const dueDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  const studentName = student.name ?? student.email;

  const invoice = await prisma.invoice.create({
    data: {
      studentProfileId: student.studentProfile.id,
      createdById: session.user.id,
      invoiceNumber,
      title: `Invoice - ${studentName}`,
      subject: `Invoice ${invoiceNumber} from ${settings.companyName}`,
      recipientEmail: student.email,
      currency: settings.defaultCurrency,
      subtotal: 0,
      discountAmount: 0,
      taxRate: settings.defaultTaxRate,
      taxAmount: 0,
      shippingAmount: 0,
      totalAmount: 0,
      dueDate,
      paymentTerms: settings.paymentTerms,
      remarks: settings.paymentRemarks,
      status: "DRAFT",
      htmlSnapshot: "",
      companyName: settings.companyName,
      companyAddress: settings.addressLine,
      companyContact: settings.contactDetails,
      companyLogoUrl: settings.logoUrl,
      billToName: studentName,
      billToAddress: student.studentProfile.currentAddress,
      billToPhone: student.studentProfile.phone,
      billToEmail: student.email,
      lineItems: {
        create: [
          {
            description: "Service",
            quantity: 1,
            unitPrice: 0,
            amount: 0,
            taxable: true,
          },
        ],
      },
    },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: student.studentProfile.id,
      entityType: "INVOICE",
      entityId: invoice.id,
      action: "Created invoice draft",
    },
  });
  redirect(`/dashboard/invoices/${invoice.id}/preview`);
}

async function addStudentThreadMessageAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN" && session.user.role !== "INTERNAL_STAFF")) {
    redirect("/login");
  }
  const studentId = String(formData.get("studentId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!studentId || !content) redirect(`/dashboard/students/${studentId}`);

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (!studentProfile) redirect(`/dashboard/students/${studentId}`);

  let conversation = await prisma.conversation.findFirst({
    where: { studentProfileId: studentProfile.id, type: "STUDENT_THREAD" },
    select: { id: true },
  });
  if (!conversation) {
    const created = await prisma.conversation.create({
      data: {
        type: "STUDENT_THREAD",
        title: "Client internal thread",
        studentProfileId: studentProfile.id,
        createdById: session.user.id,
      },
      select: { id: true },
    });
    conversation = created;
  }

  await prisma.conversationParticipant.upsert({
    where: {
      conversationId_userId: {
        conversationId: conversation.id,
        userId: session.user.id,
      },
    },
    update: {},
    create: {
      conversationId: conversation.id,
      userId: session.user.id,
    },
  });

  await prisma.message.create({
    data: {
      conversationId: conversation.id,
      senderId: session.user.id,
      content,
    },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: studentProfile.id,
      entityType: "MESSAGE",
      entityId: conversation.id,
      action: "Added internal message",
    },
  });
  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath(`/dashboard/communication/${conversation.id}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function updateStudentNoteAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN" && session.user.role !== "INTERNAL_STAFF")) {
    redirect("/login");
  }
  const studentId = String(formData.get("studentId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");
  const content = String(formData.get("content") ?? "").trim();
  if (!studentId || !messageId || !content) redirect(`/dashboard/students/${studentId}`);

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      conversation: {
        include: { studentProfile: { select: { userId: true } } },
      },
    },
  });
  if (!message || message.conversation.studentProfile?.userId !== studentId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  const canEdit = session.user.role === "ADMIN" || session.user.role === "SUB_ADMIN" || message.senderId === session.user.id;
  if (!canEdit) redirect(`/dashboard/students/${studentId}`);

  await prisma.message.update({
    where: { id: messageId },
    data: { content },
  });

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (studentProfile) {
    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: studentProfile.id,
        entityType: "MESSAGE",
        entityId: messageId,
        action: "Edited internal note",
        metadata: { conversationId: message.conversationId },
      },
    });
  }

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath(`/dashboard/communication/${message.conversationId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function deleteStudentNoteAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN" && session.user.role !== "INTERNAL_STAFF")) {
    redirect("/login");
  }
  const studentId = String(formData.get("studentId") ?? "");
  const messageId = String(formData.get("messageId") ?? "");
  if (!studentId || !messageId) redirect(`/dashboard/students/${studentId}`);

  const message = await prisma.message.findUnique({
    where: { id: messageId },
    include: {
      conversation: {
        include: { studentProfile: { select: { id: true, userId: true } } },
      },
    },
  });
  if (!message || message.conversation.studentProfile?.userId !== studentId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  const canDelete = session.user.role === "ADMIN" || session.user.role === "SUB_ADMIN" || message.senderId === session.user.id;
  if (!canDelete) redirect(`/dashboard/students/${studentId}`);

  const studentProfileId = message.conversation.studentProfile?.id;
  await prisma.message.delete({
    where: { id: messageId },
  });

  if (studentProfileId) {
    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: studentProfileId,
        entityType: "MESSAGE",
        entityId: messageId,
        action: "Deleted internal note",
        metadata: { conversationId: message.conversationId },
      },
    });
  }

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath(`/dashboard/communication/${message.conversationId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function deleteContractAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    redirect("/login");
  }
  const contractId = String(formData.get("contractId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  if (!contractId || !studentId) redirect(studentId ? studentFinancialsUrl(studentId) : "/dashboard");

  // Option A: any sub-admin may act on any client; internal staff are limited
  // to clients delegated to them.
  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: { userId: studentId },
      },
      select: { id: true },
    });
    if (!assigned) redirect(studentFinancialsUrl(studentId));
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, studentProfileId: true },
  });
  if (!contract) redirect(studentFinancialsUrl(studentId));

  await prisma.outboundEmailLog.deleteMany({
    where: { relatedContractId: contract.id },
  });
  await prisma.contract.delete({
    where: { id: contract.id },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: contract.studentProfileId,
      entityType: "CONTRACT",
      entityId: contract.id,
      action: "Deleted contract",
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(studentFinancialsUrl(studentId));
}

async function deleteInvoiceAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (
    !session?.user ||
    (session.user.role !== "ADMIN" &&
      session.user.role !== "SUB_ADMIN" &&
      session.user.role !== "INTERNAL_STAFF")
  ) {
    redirect("/login");
  }
  const invoiceId = String(formData.get("invoiceId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  if (!invoiceId || !studentId) redirect(studentId ? studentFinancialsUrl(studentId) : "/dashboard");

  // Option A: any sub-admin may act on any client; internal staff are limited
  // to clients delegated to them.
  if (session.user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: session.user.id,
        isActive: true,
        studentProfile: { userId: studentId },
      },
      select: { id: true },
    });
    if (!assigned) redirect(studentFinancialsUrl(studentId));
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { id: true, studentProfileId: true },
  });
  if (!invoice) redirect(studentFinancialsUrl(studentId));

  await prisma.outboundEmailLog.deleteMany({
    where: { relatedInvoiceId: invoice.id },
  });
  await prisma.invoice.delete({
    where: { id: invoice.id },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: invoice.studentProfileId,
      entityType: "INVOICE",
      entityId: invoice.id,
      action: "Deleted invoice",
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(studentFinancialsUrl(studentId));
}

async function createLeadAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const leadName = String(formData.get("leadName") ?? "").trim();
  const phone = nullableText(formData.get("phone"));
  const email = nullableText(formData.get("email"));
  const source = nullableText(formData.get("source"));
  const sourceChannel = nullableText(formData.get("sourceChannel"));
  const campaignName = nullableText(formData.get("campaignName"));
  const accountSelection = String(formData.get("accountSelection") ?? "CREATE_NEW");
  const newAccountTypeRaw = String(formData.get("newAccountType") ?? "STUDENT");
  const newAccountName = String(formData.get("newAccountName") ?? "").trim();
  const existingAccountId = String(formData.get("existingAccountId") ?? "");
  const ownerIdRaw = String(formData.get("ownerId") ?? "");
  const ownerId = ownerIdRaw || null;
  const leadScore = clampLeadScore(Number(formData.get("leadScore") ?? 0));
  const parentName = nullableText(formData.get("parentName"));
  const parentPhone = nullableText(formData.get("parentPhone"));
  const parentEmail = nullableText(formData.get("parentEmail"));
  const nextFollowUpAt = parseOptionalDate(String(formData.get("nextFollowUpAt") ?? "").trim());
  const newAccountType =
    newAccountTypeRaw === "PARENT" ||
    newAccountTypeRaw === "PARTNER" ||
    newAccountTypeRaw === "INSTITUTION"
      ? newAccountTypeRaw
      : "STUDENT";

  if (!studentId || !leadName) redirect(`/dashboard/students/${studentId}`);
  const access = await ensureLeadWorkflowAccess(studentId, session.user, true);

  if (ownerId) {
    const ownerExists = await prisma.user.findFirst({
      where: { id: ownerId, role: { in: ["ADMIN", "SUB_ADMIN", "INTERNAL_STAFF"] } },
      select: { id: true },
    });
    if (!ownerExists) redirect(`/dashboard/students/${studentId}`);
  }

  let accountId = "";
  if (accountSelection === "USE_EXISTING") {
    const existingAccount = await prisma.crmAccount.findUnique({
      where: { id: existingAccountId },
      select: { id: true },
    });
    if (!existingAccount) redirect(`/dashboard/students/${studentId}`);
    accountId = existingAccount.id;
  } else {
    if (!newAccountName) redirect(`/dashboard/students/${studentId}`);
    const tag = newAccountName.toLowerCase().includes("educationpro") ? "EducationPro" : null;
    const createdAccount = await prisma.crmAccount.create({
      data: {
        name: newAccountName,
        accountType: newAccountType,
        phone,
        email,
        source,
        tag,
      },
      select: { id: true },
    });
    accountId = createdAccount.id;
  }

  const lead = await prisma.lead.create({
    data: {
      name: leadName,
      phone,
      email,
      source,
      sourceChannel,
      campaignName,
      status: "NEW",
      ownerId,
      assignedAt: ownerId ? new Date() : null,
      leadScore,
      nextFollowUpAt,
      parentName,
      parentPhone,
      parentEmail,
      studentProfileId: access.studentProfileId,
      accountId,
    },
    select: { id: true },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "LEAD",
      entityId: lead.id,
      action: "Lead created",
      metadata: {
        leadName,
        status: "NEW",
        accountSelection,
        accountId,
        ownerId,
        leadScore,
      },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/sub-admin");
  redirect(`/dashboard/students/${studentId}`);
}

async function convertLeadAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  if (!studentId || !leadId) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: { opportunity: true },
  });
  if (!lead || lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }
  if (!canManageLead(session.user, lead.ownerId)) {
    redirect(`/dashboard/students/${studentId}`);
  }
  if (lead.status !== "QUALIFIED") {
    redirect(`/dashboard/students/${studentId}`);
  }

  if (!lead.opportunity) {
    await prisma.$transaction([
      prisma.opportunity.create({
        data: {
          leadId: lead.id,
          accountId: lead.accountId,
          name: `${lead.name} Opportunity`,
          amount: 0,
          probability: 25,
          expectedCloseDate: lead.nextFollowUpAt ?? null,
          forecastCategory: "PIPELINE",
          stage: "NEW",
        },
      }),
      prisma.lead.update({
        where: { id: lead.id },
        data: { status: "CONVERTED", convertedAt: new Date() },
      }),
    ]);
  }

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "LEAD",
      entityId: lead.id,
      action: "Lead converted to opportunity",
      metadata: { fromStatus: "QUALIFIED", toStatus: "CONVERTED" },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function updateLeadQualificationAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  if (!studentId || !leadId) redirect(`/dashboard/students/${studentId}`);
  const access = await ensureLeadWorkflowAccess(studentId, session.user);

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, studentProfileId: true, ownerId: true },
  });
  if (!lead || lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }
  if (!canManageLead(session.user, lead.ownerId)) {
    redirect(`/dashboard/students/${studentId}`);
  }

  const ownerIdRaw = String(formData.get("ownerId") ?? "");
  const ownerId = ownerIdRaw || null;
  if (ownerId) {
    const ownerExists = await prisma.user.findFirst({
      where: { id: ownerId, role: { in: ["ADMIN", "SUB_ADMIN", "INTERNAL_STAFF"] } },
      select: { id: true },
    });
    if (!ownerExists) redirect(`/dashboard/students/${studentId}`);
  }

  const nextFollowUpAt = parseOptionalDate(String(formData.get("nextFollowUpAt") ?? "").trim());
  const leadScore = clampLeadScore(Number(formData.get("leadScore") ?? 0));
  const qualificationReason = nullableText(formData.get("qualificationReason"));
  const qualificationNotes = nullableText(formData.get("qualificationNotes"));

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      ownerId,
      assignedAt: ownerId ? new Date() : null,
      nextFollowUpAt,
      leadScore,
      qualificationReason,
      qualificationNotes,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "LEAD",
      entityId: leadId,
      action: "Lead qualification details updated",
      metadata: { ownerId, leadScore, nextFollowUpAt, qualificationReason },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function updateLeadStatusAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const leadId = String(formData.get("leadId") ?? "");
  const nextStatusRaw = String(formData.get("nextStatus") ?? "NEW") as LeadStatus;
  if (!studentId || !leadId) redirect(`/dashboard/students/${studentId}`);
  const access = await ensureLeadWorkflowAccess(studentId, session.user);

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, studentProfileId: true, status: true, ownerId: true, firstResponseAt: true },
  });
  if (!lead || lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }
  if (!canManageLead(session.user, lead.ownerId)) {
    redirect(`/dashboard/students/${studentId}`);
  }
  const nextStatus = sanitizeLeadStatus(nextStatusRaw);
  if (!canTransitionLeadStatus(lead.status, nextStatus)) {
    redirect(`/dashboard/students/${studentId}`);
  }

  await prisma.lead.update({
    where: { id: leadId },
    data: {
      status: nextStatus,
      convertedAt: nextStatus === "CONVERTED" ? new Date() : undefined,
      lastContactAt:
        nextStatus === "CONTACTED" || nextStatus === "QUALIFIED" || nextStatus === "NURTURE"
          ? new Date()
          : undefined,
      firstResponseAt:
        !lead.firstResponseAt &&
        (nextStatus === "CONTACTED" || nextStatus === "QUALIFIED" || nextStatus === "NURTURE")
          ? new Date()
          : undefined,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "LEAD",
      entityId: leadId,
      action: `Lead status changed: ${formatLeadStatus(lead.status)} -> ${formatLeadStatus(nextStatus)}`,
      metadata: { fromStatus: lead.status, toStatus: nextStatus },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function updateOpportunityPipelineAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const opportunityId = String(formData.get("opportunityId") ?? "");
  const name = String(formData.get("name") ?? "").trim() || "Opportunity";
  const amount = Number(formData.get("amount") ?? 0);
  const probability = clampPercent(Number(formData.get("probability") ?? 0));
  const expectedCloseDate = parseOptionalDate(String(formData.get("expectedCloseDate") ?? "").trim());
  const forecastCategoryRaw = String(formData.get("forecastCategory") ?? "PIPELINE");
  const stage = String(formData.get("stage") ?? "NEW") as OpportunityStage;
  const safeStage: OpportunityStage = ["NEW", "QUOTE_SENT", "CLOSED_WON", "CLOSED_LOST"].includes(stage)
    ? stage
    : "NEW";
  const forecastCategory: OpportunityForecastCategory =
    forecastCategoryRaw === "BEST_CASE" ||
    forecastCategoryRaw === "COMMIT" ||
    forecastCategoryRaw === "CLOSED"
      ? forecastCategoryRaw
      : "PIPELINE";

  if (!studentId || !opportunityId) redirect(`/dashboard/students/${studentId}`);
  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { lead: { select: { studentProfileId: true } } },
  });
  if (!opportunity || opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: {
      name,
      amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
      probability,
      expectedCloseDate,
      forecastCategory,
      stage: safeStage,
      closedAt: safeStage === "CLOSED_WON" || safeStage === "CLOSED_LOST" ? new Date() : null,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "OPPORTUNITY",
      entityId: opportunityId,
      action: "Opportunity pipeline updated",
      metadata: {
        stage: safeStage,
        amount,
        probability,
        expectedCloseDate,
        forecastCategory,
      },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function createQuoteAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const opportunityId = String(formData.get("opportunityId") ?? "");
  const amount = Number(formData.get("amount") ?? 0);
  const description = nullableText(formData.get("description"));
  if (!studentId || !opportunityId || !Number.isFinite(amount) || amount < 0) {
    redirect(`/dashboard/students/${studentId}`);
  }

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: { lead: { select: { studentProfileId: true } } },
  });
  if (!opportunity || opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  const quote = await prisma.quote.create({
    data: {
      opportunityId,
      amount,
      description,
      status: "DRAFT",
    },
    select: { id: true },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "QUOTE",
      entityId: quote.id,
      action: "Created quote draft",
      metadata: { amount },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function submitQuoteForApprovalAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const quoteId = String(formData.get("quoteId") ?? "");
  if (!studentId || !quoteId) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { opportunity: { include: { lead: { select: { studentProfileId: true } } } } },
  });
  if (!quote || quote.opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        submittedById: session.user.id,
      },
    }),
    prisma.opportunity.update({
      where: { id: quote.opportunityId },
      data: { stage: "QUOTE_SENT" },
    }),
  ]);

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "QUOTE",
      entityId: quoteId,
      action: "Submitted quote for approval",
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function approveQuoteAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const quoteId = String(formData.get("quoteId") ?? "");
  const approvalNotes = nullableText(formData.get("approvalNotes"));
  if (!studentId || !quoteId) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { opportunity: { include: { lead: { select: { studentProfileId: true } } } } },
  });
  if (!quote || quote.opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: session.user.id,
      decisionedAt: new Date(),
      approvalNotes,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "QUOTE",
      entityId: quoteId,
      action: "Quote approved",
      metadata: { approvalNotes },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function rejectQuoteAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const quoteId = String(formData.get("quoteId") ?? "");
  const approvalNotes = nullableText(formData.get("approvalNotes"));
  if (!studentId || !quoteId) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { opportunity: { include: { lead: { select: { studentProfileId: true } } } } },
  });
  if (!quote || quote.opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  await prisma.quote.update({
    where: { id: quoteId },
    data: {
      status: "REJECTED",
      rejectedById: session.user.id,
      decisionedAt: new Date(),
      approvalNotes,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "QUOTE",
      entityId: quoteId,
      action: "Quote rejected",
      metadata: { approvalNotes },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function closeOpportunityAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!studentId || !opportunityId) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      lead: { select: { studentProfileId: true } },
      quotes: { select: { status: true } },
    },
  });
  if (!opportunity || opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }
  const approvedQuoteExists = opportunity.quotes.some((quote) => quote.status === "APPROVED");
  if (!approvedQuoteExists) redirect(`/dashboard/students/${studentId}`);

  await prisma.opportunity.update({
    where: { id: opportunityId },
    data: { stage: "CLOSED_WON", closedAt: new Date(), forecastCategory: "CLOSED", probability: 100 },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "OPPORTUNITY",
      entityId: opportunityId,
      action: "Closed opportunity as won",
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function convertOpportunityToCaseAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const opportunityId = String(formData.get("opportunityId") ?? "");
  if (!studentId || !opportunityId) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const opportunity = await prisma.opportunity.findUnique({
    where: { id: opportunityId },
    include: {
      lead: { select: { id: true, name: true, studentProfileId: true } },
      case: { select: { id: true } },
    },
  });
  if (!opportunity || opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }
  if (opportunity.stage !== "CLOSED_WON" || opportunity.case) {
    redirect(`/dashboard/students/${studentId}`);
  }

  const createdCase = await prisma.case.create({
    data: {
      opportunityId,
      accountId: opportunity.accountId,
      title: `${opportunity.lead.name} Case`,
      description: "Case created from won opportunity.",
      status: "OPEN",
    },
    select: { id: true },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "CASE",
      entityId: createdCase.id,
      action: "Converted won opportunity to case",
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function updateCaseAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");

  const studentId = String(formData.get("studentId") ?? "");
  const caseId = String(formData.get("caseId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = nullableText(formData.get("description"));
  const status = String(formData.get("status") ?? "OPEN") as CaseStatus;
  const assignedAgentIdRaw = String(formData.get("assignedAgentId") ?? "");
  const activityNote = nullableText(formData.get("activityNote"));
  const safeStatus: CaseStatus = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].includes(status)
    ? status
    : "OPEN";
  const assignedAgentId = assignedAgentIdRaw || null;
  if (!studentId || !caseId || !title) redirect(`/dashboard/students/${studentId}`);

  const access = await ensureLeadWorkflowAccess(studentId, session.user);
  const existingCase = await prisma.case.findUnique({
    where: { id: caseId },
    include: {
      opportunity: { include: { lead: { select: { studentProfileId: true } } } },
    },
  });
  if (!existingCase || existingCase.opportunity.lead.studentProfileId !== access.studentProfileId) {
    redirect(`/dashboard/students/${studentId}`);
  }

  if (assignedAgentId) {
    const assignedAgent = await prisma.user.findFirst({
      where: { id: assignedAgentId, role: "INTERNAL_STAFF", deletedAt: null },
      select: { id: true },
    });
    if (!assignedAgent) redirect(`/dashboard/students/${studentId}`);
  }

  await prisma.case.update({
    where: { id: caseId },
    data: {
      title,
      description,
      status: safeStatus,
      assignedAgentId,
    },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: access.studentProfileId,
      entityType: "CASE",
      entityId: caseId,
      action: activityNote ? `Updated case: ${activityNote}` : "Updated case details",
      metadata: { status: safeStatus, assignedAgentId },
    },
  });

  revalidatePath(`/dashboard/students/${studentId}`);
  redirect(`/dashboard/students/${studentId}`);
}

async function ensureLeadWorkflowAccess(
  studentId: string,
  user: { id: string; role: string },
  createProfileIfMissing = false,
) {
  if (user.role !== "ADMIN" && user.role !== "SUB_ADMIN" && user.role !== "INTERNAL_STAFF") {
    redirect("/dashboard");
  }
  const student = await prisma.user.findFirst({
    where: { id: studentId, role: "USER", deletedAt: null },
    select: { id: true, studentProfile: { select: { id: true } } },
  });
  if (!student) {
    redirect("/dashboard");
  }

  // Option A: any sub-admin may act on any client; internal staff are limited
  // to clients delegated to them.
  if (user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: user.id,
        isActive: true,
        studentProfile: { userId: studentId },
      },
      select: { id: true },
    });
    if (!assigned) redirect(studentOverviewUrl(studentId));
  }

  if (student.studentProfile) {
    return { studentProfileId: student.studentProfile.id };
  }
  if (!createProfileIfMissing) {
    redirect(studentOverviewUrl(studentId));
  }

  const createdProfile = await runWithUniqueCaseReference(prisma, (caseReference) =>
    prisma.studentProfile.create({
      data: {
        caseReference,
        userId: studentId,
      },
      select: { id: true },
    }),
  );
  return { studentProfileId: createdProfile.id };
}

function nullableText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

function parseOptionalDate(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sanitizeLeadStatus(status: LeadStatus): LeadStatus {
  if (
    status === "CONTACTED" ||
    status === "QUALIFIED" ||
    status === "NURTURE" ||
    status === "DISQUALIFIED" ||
    status === "CONVERTED"
  ) {
    return status;
  }
  return "NEW";
}

function canTransitionLeadStatus(current: LeadStatus, next: LeadStatus) {
  if (current === next) return true;
  const allowed: Record<LeadStatus, LeadStatus[]> = {
    NEW: ["CONTACTED", "QUALIFIED", "NURTURE", "DISQUALIFIED"],
    CONTACTED: ["QUALIFIED", "NURTURE", "DISQUALIFIED"],
    QUALIFIED: ["NURTURE", "DISQUALIFIED", "CONVERTED"],
    NURTURE: ["CONTACTED", "QUALIFIED", "DISQUALIFIED"],
    DISQUALIFIED: ["NURTURE", "CONTACTED"],
    CONVERTED: [],
  };
  return allowed[current].includes(next);
}

function canManageLead(user: { id: string; role: string }, ownerId?: string | null) {
  if (user.role === "ADMIN" || user.role === "SUB_ADMIN") return true;
  if (user.role === "INTERNAL_STAFF") return !ownerId || ownerId === user.id;
  return false;
}

function clampLeadScore(raw: number) {
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function clampPercent(raw: number) {
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

function formatCrmAccountType(type: CrmAccountType) {
  if (type === "INSTITUTION") return "Institution";
  if (type === "PARENT") return "Parent/Sponsor";
  if (type === "PARTNER") return "Partner";
  return "Client";
}

function formatLeadStatus(status: LeadStatus) {
  if (status === "CONTACTED") return "Contacted";
  if (status === "QUALIFIED") return "Qualified";
  if (status === "NURTURE") return "Nurture";
  if (status === "DISQUALIFIED") return "Disqualified";
  if (status === "CONVERTED") return "Converted";
  return "New";
}

function leadStatusTone(status: LeadStatus) {
  if (status === "CONTACTED") return "bg-blue-50 text-blue-700";
  if (status === "QUALIFIED") return "bg-emerald-50 text-emerald-700";
  if (status === "NURTURE") return "bg-amber-50 text-amber-700";
  if (status === "DISQUALIFIED") return "bg-rose-50 text-rose-700";
  if (status === "CONVERTED") return "bg-emerald-50 text-emerald-700";
  return "bg-slate-100 text-slate-700";
}

function formatOpportunityStage(stage: OpportunityStage) {
  if (stage === "QUOTE_SENT") return "Quote Sent";
  if (stage === "CLOSED_WON") return "Closed Won";
  if (stage === "CLOSED_LOST") return "Closed Lost";
  return "New";
}

function opportunityStageTone(stage: OpportunityStage) {
  if (stage === "QUOTE_SENT") return "bg-blue-50 text-blue-700";
  if (stage === "CLOSED_WON") return "bg-emerald-50 text-emerald-700";
  if (stage === "CLOSED_LOST") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

function formatQuoteStatus(status: QuoteStatus) {
  if (status === "SUBMITTED") return "Submitted";
  if (status === "APPROVED") return "Approved";
  if (status === "REJECTED") return "Rejected";
  return "Draft";
}

function quoteStatusTone(status: QuoteStatus) {
  if (status === "SUBMITTED") return "bg-blue-50 text-blue-700";
  if (status === "APPROVED") return "bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "bg-rose-50 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

function formatCaseStatus(status: CaseStatus) {
  if (status === "IN_PROGRESS") return "In Progress";
  if (status === "RESOLVED") return "Resolved";
  if (status === "CLOSED") return "Closed";
  return "Open";
}

function caseStatusTone(status: CaseStatus) {
  if (status === "IN_PROGRESS") return "bg-blue-50 text-blue-700";
  if (status === "RESOLVED") return "bg-emerald-50 text-emerald-700";
  if (status === "CLOSED") return "bg-slate-200 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

function formatMoney(currency: string, amount: number) {
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: currency || "AUD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function invoiceStatusTone(status: string) {
  if (status === "SENT") return "bg-blue-50 text-blue-700";
  if (status === "PAID") return "bg-emerald-50 text-emerald-700";
  if (status === "OVERDUE") return "bg-amber-50 text-amber-700";
  if (status === "CANCELLED") return "bg-gray-200 text-gray-700";
  return "bg-gray-100 text-gray-700";
}

function contractStatusTone(status: string) {
  if (status === "SENT") return "bg-blue-50 text-blue-700";
  if (status === "ACCEPTED") return "bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "bg-rose-50 text-rose-700";
  if (status === "CANCELLED") return "bg-gray-200 text-gray-700";
  return "bg-gray-100 text-gray-700";
}
