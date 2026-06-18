import type { CaseStage, SubmissionStatus, TaskStatus } from "@prisma/client";
import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { auth } from "@/auth";
import { CaseReferenceLabel } from "@/components/case-reference-label";
import { ContributionsTabSection } from "@/components/contributions-tab-panel";
import { DeletedClientsTab } from "@/components/deleted-clients-tab";
import { DashboardProfileHeader } from "@/components/dashboard-profile-header";
import { DashboardTabBar } from "@/components/dashboard-tab-bar";
import {
  restoreDeletedClientAction,
  permanentDeleteDeletedClientAction,
} from "@/app/dashboard/deleted-client-actions";
import { deletedClientUserWhere, listDeletedClients } from "@/lib/deleted-clients";
import { blobOpensThroughAuthenticatedApi } from "@/lib/blob-access";
import { DelegationSuccessToast } from "@/components/delegation-success-toast";
import { LocationFilterButtons } from "@/components/location-filter-buttons";
import { NewInquiriesCard } from "@/components/new-inquiries-card";
import { RemindersWidget } from "@/components/reminders-widget";
import { StaffDashboardTasks } from "@/components/staff-dashboard-tasks";
import { StudentClientIntakeForm } from "@/components/student-client-intake-form";
import { VisaOutcomesPanel } from "@/components/visa-outcomes-panel";
import { queueDevEmail } from "@/lib/email-outbox";
import { runWithUniqueCaseReference } from "@/lib/case-reference";
import { markNewApplicationNotificationsHandled } from "@/lib/claims";
import { startNewVisaCaseForProfile } from "@/lib/visa-cases";
import {
  buildManualIntakeAnswers,
  buildManualIntakeProfileData,
  parseManualClientIntakeFormData,
} from "@/lib/manual-client-intake";
import { prisma } from "@/lib/prisma";
import {
  completedTaskStatusFilter,
  executeTaskReassignment,
  listTaskAssigneeOptions,
  normalizeTaskListView,
  openTaskStatusFilter,
  taskDashboardListWhereForAgent,
  taskDashboardWhereForAgent,
  taskListOrderBy,
  userCanManageTask,
} from "@/lib/task-assignment";
import {
  createWorkflowNotification,
  notifyStudentTeamDelegationChange,
} from "@/lib/workflow-notifications";
import {
  revalidateContributionsCache,
  revalidateContributionsCacheForCases,
} from "@/lib/contributions-cache";
import { redirectWithDashboardNotice, redirectWithDelegationNotice } from "@/lib/redirect-after-delegation";
import { getRemindersForUser } from "@/lib/reminders";
import { getDashboardPath } from "@/lib/roles";
import {
  buildInquiryLocationWhere,
  buildSubmissionWhere,
  normalizeInquiryLocationFilter,
} from "@/lib/submission-filters";
import { formatSubmissionStatus, submissionStatuses } from "@/lib/submission";
import { formatVisaStatus, formatYearsLeft } from "@/lib/student-tracking";
import { formatSubmissionServiceSummary } from "@/lib/visa-services";
import {
  allCaseStages,
  caseStageLabel,
  caseStageOrder,
  caseStageTerminals,
  caseStageTone,
} from "@/lib/case-stage";

type SearchParams = Promise<{
  search?: string;
  status?: string;
  country?: string;
  course?: string;
  inquiryLocation?: string;
  queue?: string;
  stage?: string;
  tab?: string;
  taskView?: string;
  manualError?: string;
  manualSuccess?: string;
  claimError?: string;
}>;

export default async function SubAdminDashboardPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const tab = (searchParams.tab ?? "overview") as
    | "overview"
    | "students"
    | "visa-outcomes"
    | "tasks"
    | "team"
    | "contributions"
    | "deleted-clients";
  const isDeletedClientsTab = tab === "deleted-clients";
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  if (session.user.role !== "SUB_ADMIN" && session.user.role !== "ADMIN") {
    redirect(getDashboardPath(session.user.role));
  }

  const search = searchParams.search ?? "";
  const status = searchParams.status ?? "";
  const country = searchParams.country ?? "";
  const course = searchParams.course ?? "";
  const inquiryLocation = normalizeInquiryLocationFilter(searchParams.inquiryLocation);
  const inquiryLocationWhere = buildInquiryLocationWhere(inquiryLocation);
  const queueRaw = searchParams.queue ?? "all";
  const queueFilter: "all" | "unassigned" | "my_cases" | "delegated" | "overdue" | "needs_approval" =
    queueRaw === "unassigned" ||
    queueRaw === "my_cases" ||
    queueRaw === "delegated" ||
    queueRaw === "overdue" ||
    queueRaw === "needs_approval"
      ? queueRaw
      : "all";
  const stageRaw = (searchParams.stage ?? "") as CaseStage | "";
  const stageFilter: CaseStage | "" =
    stageRaw && (allCaseStages as string[]).includes(stageRaw) ? stageRaw : "";
  const manualStudentError =
    searchParams.manualError === "duplicate"
      ? "A non-client account already exists with that email."
      : searchParams.manualError === "validation"
        ? "Please complete all required fields with valid details."
        : searchParams.manualError === "template"
          ? "No active questionnaire template is available for agent intake."
          : null;
  const manualStudentSuccess = searchParams.manualSuccess === "client";
  const manualStudentSuccessType = "client" as const;
  const claimErrorMessage =
    searchParams.claimError === "taken"
      ? "That enquiry was just claimed by another team member."
      : null;

  const isOverviewTab = tab === "overview";
  const isStudentsTab = tab === "students";
  const isTasksTab = tab === "tasks";
  const taskView = normalizeTaskListView(searchParams.taskView);
  const isTeamTab = tab === "team";
  const isAdminViewer = session.user.role === "ADMIN";
  const needsSubmissions = true;
  const needsTeamData = isOverviewTab || isTeamTab;
  const needsApprovalData = isOverviewTab || isStudentsTab;

  const overviewSubmissionWhere = buildSubmissionWhere({
    role: session.user.role,
    userId: session.user.id,
    search,
    status,
    country,
    course,
    inquiryLocation,
    includeUnassignedForSubAdmin: true,
  });
  const studentsSubmissionWhere = buildSubmissionWhere({
    role: session.user.role,
    userId: session.user.id,
    search,
    status,
    country,
    course,
    inquiryLocation,
    subAdminScope: session.user.role === "SUB_ADMIN" ? "all" : undefined,
    includeUnassignedForSubAdmin: session.user.role === "ADMIN",
  });
  const activeSubmissionWhere = isStudentsTab ? studentsSubmissionWhere : overviewSubmissionWhere;

  const today = new Date();
  const trendWindowStart = new Date(today);
  trendWindowStart.setDate(trendWindowStart.getDate() - 56);
  const oneDayAgo = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [
    reminders,
    submissions,
    studentsTabSubmissions,
    trendSubmissions,
    pendingReviews,
    offersInProgress,
    homePosts,
    teamMembers,
    activeAssignments,
    openTaskCount,
    completedTaskCount,
    agentTasks,
    taskAssigneeOptions,
    allInternalStaff,
    stagePipelineCounts,
    newInquiries,
    newInquiriesLast24hCount,
    deletedClientsCount,
    deletedClients,
    visaOutcomes,
  ] =
    await Promise.all([
      isOverviewTab ? getRemindersForUser(session.user.role as "ADMIN" | "SUB_ADMIN", session.user.id) : Promise.resolve([]),
      needsSubmissions ? prisma.questionnaireSubmission.findMany({
        where: activeSubmissionWhere,
        include: {
          student: {
            include: {
              studentProfile: {
                include: {
                  assignments: {
                    where: { isActive: true },
                    orderBy: { createdAt: "desc" },
                    select: {
                      id: true,
                      assignedToId: true,
                      assignedTo: { select: { name: true, email: true, role: true } },
                      assignedBy: { select: { name: true, email: true } },
                    },
                  },
                },
              },
            },
          },
          assignedSubAdmin: { select: { id: true, name: true, email: true } },
        },
        orderBy: { submittedAt: "desc" },
        take: isStudentsTab ? 100 : 50,
      }) : Promise.resolve([]),
      needsSubmissions && !isStudentsTab
        ? prisma.questionnaireSubmission.findMany({
            where: studentsSubmissionWhere,
            include: {
              student: {
                include: {
                  studentProfile: {
                    include: {
                      assignments: {
                        where: { isActive: true },
                        orderBy: { createdAt: "desc" },
                        select: {
                          id: true,
                          assignedToId: true,
                          assignedTo: { select: { name: true, email: true, role: true } },
                          assignedBy: { select: { name: true, email: true } },
                        },
                      },
                    },
                  },
                },
              },
              assignedSubAdmin: { select: { id: true, name: true, email: true } },
            },
            orderBy: { submittedAt: "desc" },
            take: 100,
          })
        : Promise.resolve([]),
      // trendSubmissions (500 rows) only needed for the overview trend chart
      isOverviewTab ? prisma.questionnaireSubmission.findMany({
        where: {
          ...overviewSubmissionWhere,
          submittedAt: { gte: trendWindowStart },
        },
        select: {
          status: true,
          submittedAt: true,
          updatedAt: true,
        },
        orderBy: { submittedAt: "asc" },
        take: 500,
      }) : Promise.resolve([]),
    isOverviewTab ? prisma.questionnaireSubmission.count({
      where: {
        ...overviewSubmissionWhere,
        status: {
          in: ["SUBMITTED", "UNDER_REVIEW", "DOCS_REQUESTED"],
        },
      },
    }) : Promise.resolve(0),
    isOverviewTab ? prisma.questionnaireSubmission.count({
      where: {
        ...overviewSubmissionWhere,
        status: {
          in: ["OFFER_RECEIVED", "VISA_GRANTED", "ENROLLED"],
        },
      },
    }) : Promise.resolve(0),
    // homePosts only needed for team tab
    isTeamTab ? prisma.homePost.findMany({
      where:
        session.user.role === "ADMIN"
          ? undefined
          : {
              authorId: session.user.id,
            },
      include: { author: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 8,
    }) : Promise.resolve([]),
    needsTeamData ? prisma.staffTeamMembership.findMany({
      where:
        session.user.role === "ADMIN"
          ? undefined
          : {
              managerId: session.user.id,
            },
      include: {
        internalStaff: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }) : Promise.resolve([]),
    isTeamTab ? prisma.studentAssignment.findMany({
      where:
        session.user.role === "ADMIN"
          ? { isActive: true }
          : {
              isActive: true,
              assignedById: session.user.id,
            },
      include: {
        studentProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 8,
    }) : Promise.resolve([]),
      // Unconditional: powers the Tasks tab badge on every tab (cheap COUNT)
      prisma.task.count({
        where: taskDashboardWhereForAgent(session.user.id, isAdminViewer),
      }),
      isTasksTab
        ? prisma.task.count({
            where: {
              AND: [
                taskDashboardListWhereForAgent(session.user.id, isAdminViewer),
                completedTaskStatusFilter(),
              ],
            },
          })
        : Promise.resolve(0),
      isTasksTab
        ? prisma.task.findMany({
            where: {
              AND: [
                taskDashboardListWhereForAgent(session.user.id, isAdminViewer),
                taskView === "completed" ? completedTaskStatusFilter() : openTaskStatusFilter(),
              ],
            },
            include: {
              assignee: { select: { id: true, name: true, email: true } },
              completedBy: { select: { name: true, email: true } },
              studentProfile: { include: { user: { select: { id: true, name: true, email: true } } } },
            },
            orderBy: taskListOrderBy(taskView),
            take: 100,
          })
        : Promise.resolve([]),
      isTasksTab ? listTaskAssigneeOptions() : Promise.resolve([]),
      isStudentsTab || isTeamTab || isTasksTab
        ? prisma.user.findMany({
            where: { role: "INTERNAL_STAFF", deletedAt: null },
            select: { id: true, name: true, email: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
      // stagePipelineCounts only shown in overview
      isOverviewTab ? prisma.studentProfile.groupBy({
        by: ["caseStage"],
        where:
          session.user.role === "ADMIN"
            ? undefined
            : {
                user: {
                  submissions: {
                    some: {
                      OR: [
                        { assignedToId: session.user.id },
                        { assignedToId: null },
                      ],
                    },
                  },
                },
              },
        _count: { _all: true },
      }) : Promise.resolve([]),
      isOverviewTab ? prisma.questionnaireSubmission.findMany({
        where: {
          assignedToId: null,
          submittedAt: { gte: sevenDaysAgo },
          student: { role: "USER", deletedAt: null },
          ...(inquiryLocationWhere ?? {}),
        },
        select: {
          id: true,
          submittedAt: true,
          sourceCity: true,
          sourceCountry: true,
          student: { select: { id: true, name: true, email: true } },
        },
        orderBy: { submittedAt: "desc" },
        take: 8,
      }) : Promise.resolve([]),
      isOverviewTab ? prisma.questionnaireSubmission.count({
        where: {
          assignedToId: null,
          submittedAt: { gte: oneDayAgo },
          student: { role: "USER", deletedAt: null },
          ...(inquiryLocationWhere ?? {}),
        },
      }) : Promise.resolve(0),
    prisma.user.count({ where: deletedClientUserWhere }),
    isDeletedClientsTab ? listDeletedClients() : Promise.resolve([]),
    prisma.visaCase.findMany({
          where: {
            status: { not: "ACTIVE" },
            caseStage: { in: caseStageTerminals },
            studentProfile: { user: { deletedAt: null } },
          },
          include: {
            studentProfile: {
              select: {
                user: { select: { id: true, name: true, email: true } },
              },
            },
          },
          orderBy: [{ completedAt: "desc" }, { startedAt: "desc" }],
          take: 100,
        }),
  ]);

  const stageCountMap = new Map<string, number>(
    stagePipelineCounts.map((row) => [row.caseStage, row._count._all]),
  );
  const stageCounts = allCaseStages.map((stage) => ({
    stage,
    count: stageCountMap.get(stage) ?? 0,
  }));
  const stageTotal = stageCounts.reduce((sum, item) => sum + item.count, 0);

  const countSubmissionSource = isStudentsTab ? submissions : studentsTabSubmissions;
  const latestSubmissionPerStudent = dedupeLatestSubmissionPerStudent(submissions);
  const latestStudentsTabSubmissionPerStudent = dedupeLatestSubmissionPerStudent(countSubmissionSource);
  const activeStudentsTabItems = latestStudentsTabSubmissionPerStudent.filter(
    (item) => !item.student.studentProfile || !caseStageTerminals.includes(item.student.studentProfile.caseStage),
  );
  const activeSubmissionItems = latestSubmissionPerStudent.filter(
    (item) => !item.student.studentProfile || !caseStageTerminals.includes(item.student.studentProfile.caseStage),
  );
  const assignedStudents = activeStudentsTabItems.length;
  const myCaseCount = activeSubmissionItems.filter(
    (item) => item.assignedToId === session.user.id,
  ).length;
  const delegatedCaseCount = activeSubmissionItems.filter((item) => {
    const staffDelegations =
      item.student.studentProfile?.assignments.filter(
        (assignment) => assignment.assignedTo.role === "INTERNAL_STAFF",
      ) ?? [];
    return item.assignedToId === session.user.id && staffDelegations.length > 0;
  }).length;
  const studentProfileIds = submissions
    .map((item) => item.student.studentProfile?.id)
    .filter((id): id is string => Boolean(id));
  const teamStaffIds = Array.from(new Set(teamMembers.map((member) => member.internalStaff.id)));
  const [
    draftContractsCount,
    draftInvoicesCount,
    pendingDocumentsCount,
    teamTaskLoad,
    teamCaseLoad,
    draftContractProfiles,
    draftInvoiceProfiles,
    pendingDocumentProfiles,
  ] = await Promise.all([
    needsApprovalData ? prisma.contract.count({
      where: { studentProfileId: { in: studentProfileIds }, status: "DRAFT" },
    }) : Promise.resolve(0),
    needsApprovalData ? prisma.invoice.count({
      where: { studentProfileId: { in: studentProfileIds }, status: "DRAFT" },
    }) : Promise.resolve(0),
    needsApprovalData ? prisma.studentDocument.count({
      where: {
        verificationStatus: "PENDING",
        studentProfileId: { in: studentProfileIds },
      },
    }) : Promise.resolve(0),
    // teamTaskLoad + teamCaseLoad only needed for team tab workload display
    isTeamTab ? prisma.task.groupBy({
      by: ["assigneeId"],
      where: {
        assigneeId: { in: teamStaffIds },
        status: { in: ["TODO", "IN_PROGRESS", "BLOCKED"] },
      },
      _count: { _all: true },
    }) : Promise.resolve([]),
    isTeamTab ? prisma.studentAssignment.groupBy({
      by: ["assignedToId"],
      where: {
        isActive: true,
        assignedToId: { in: teamStaffIds },
      },
      _count: { _all: true },
    }) : Promise.resolve([]),
    needsApprovalData ? prisma.contract.findMany({
      where: { studentProfileId: { in: studentProfileIds }, status: "DRAFT" },
      select: { studentProfileId: true },
    }) : Promise.resolve([]),
    needsApprovalData ? prisma.invoice.findMany({
      where: { studentProfileId: { in: studentProfileIds }, status: "DRAFT" },
      select: { studentProfileId: true },
    }) : Promise.resolve([]),
    needsApprovalData ? prisma.studentDocument.findMany({
      where: {
        verificationStatus: "PENDING",
        studentProfileId: { in: studentProfileIds },
      },
      select: { studentProfileId: true },
    }) : Promise.resolve([]),
  ]);

  const visaExpiringSoon = submissions.filter((item) => {
    const visaExpiryDate = item.student.studentProfile?.visaExpiryDate;
    if (!visaExpiryDate) return false;
    const days = daysUntilDate(visaExpiryDate, today);
    return days >= 0 && days <= 90;
  }).length;
  const locationQuery = inquiryLocation === "all" ? "" : `&inquiryLocation=${encodeURIComponent(inquiryLocation)}`;
  const exportUrl = `/api/submissions/export?search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&country=${encodeURIComponent(country)}&course=${encodeURIComponent(course)}${locationQuery}`;
  const visaExpiringSoonItems = activeSubmissionItems.filter((item) => {
    const visaExpiryDate = item.student.studentProfile?.visaExpiryDate;
    if (!visaExpiryDate) return false;
    const days = daysUntilDate(visaExpiryDate, today);
    return days >= 0 && days <= 90;
  });
  const autoFollowUpItems = activeSubmissionItems.filter((item) => {
    const visaExpiryDate = item.student.studentProfile?.visaExpiryDate;
    const nextFollowUpDate = item.student.studentProfile?.nextFollowUpDate;
    const visaDays = visaExpiryDate ? daysUntilDate(visaExpiryDate, today) : null;
    const followUpDays = nextFollowUpDate ? daysUntilDate(nextFollowUpDate, today) : null;
    const visaWindow = visaDays !== null && visaDays >= 120 && visaDays <= 150;
    const followUpWindow = followUpDays !== null && followUpDays >= 120 && followUpDays <= 150;
    return visaWindow || followUpWindow;
  });
  const pendingItems = activeSubmissionItems.filter((item) =>
    ["SUBMITTED", "UNDER_REVIEW", "DOCS_REQUESTED"].includes(item.status),
  );
  const offerInProgressItems = activeSubmissionItems.filter((item) => item.status === "OFFER_RECEIVED");
  const enrolledItems = activeSubmissionItems.filter((item) => item.status === "ENROLLED");
  const rejectedItems = activeSubmissionItems.filter((item) => item.status === "REJECTED");
  const unassignedItems = activeSubmissionItems.filter((item) => item.assignedToId === null);
  const pendingApprovalsCount = draftContractsCount + draftInvoicesCount + pendingDocumentsCount;
  const overdueFollowUpsCount = activeSubmissionItems.filter((item) => {
    const next = item.student.studentProfile?.nextFollowUpDate;
    return next ? daysUntilDate(next, today) < 0 : false;
  }).length;
  const taskLoadByStaff = new Map(teamTaskLoad.map((row) => [row.assigneeId, row._count._all]));
  const caseLoadByStaff = new Map(teamCaseLoad.map((row) => [row.assignedToId, row._count._all]));
  const staffWorkloads = teamMembers
    .map((member) => {
      const openTasks = taskLoadByStaff.get(member.internalStaff.id) ?? 0;
      const activeCases = caseLoadByStaff.get(member.internalStaff.id) ?? 0;
      return {
        id: member.internalStaff.id,
        name: member.internalStaff.name ?? member.internalStaff.email,
        email: member.internalStaff.email,
        openTasks,
        activeCases,
      };
    })
    .sort((a, b) => b.openTasks - a.openTasks);
  const overloadedStaffCount = staffWorkloads.filter((staff) => staff.openTasks >= 8 || staff.activeCases >= 15).length;
  const suggestedAssigneeId =
    staffWorkloads.length > 0
      ? [...staffWorkloads].sort((a, b) => a.openTasks + a.activeCases - (b.openTasks + b.activeCases))[0].id
      : "";
  const approvalProfileSet = new Set([
    ...draftContractProfiles.map((item) => item.studentProfileId),
    ...draftInvoiceProfiles.map((item) => item.studentProfileId),
    ...pendingDocumentProfiles.map((item) => item.studentProfileId),
  ]);
  const filteredSubmissions = activeSubmissionItems.filter((submission) => {
    if (stageFilter && submission.student.studentProfile?.caseStage !== stageFilter) {
      return false;
    }
    if (queueFilter === "unassigned") return submission.assignedToId === null;
    if (queueFilter === "my_cases") return submission.assignedToId === session.user.id;
    if (queueFilter === "delegated") {
      const staffDelegations =
        submission.student.studentProfile?.assignments.filter(
          (assignment) => assignment.assignedTo.role === "INTERNAL_STAFF",
        ) ?? [];
      return submission.assignedToId === session.user.id && staffDelegations.length > 0;
    }
    if (queueFilter === "overdue") {
      const nextFollowUpDate = submission.student.studentProfile?.nextFollowUpDate;
      return nextFollowUpDate ? daysUntilDate(nextFollowUpDate, today) < 0 : false;
    }
    if (queueFilter === "needs_approval") {
      const profileId = submission.student.studentProfile?.id;
      return profileId ? approvalProfileSet.has(profileId) : false;
    }
    return true;
  });
  const queueFilterLabel =
    queueFilter === "unassigned"
      ? "Unassigned Cases"
      : queueFilter === "my_cases"
        ? "My Cases"
        : queueFilter === "delegated"
          ? "Delegated to Staff"
          : queueFilter === "overdue"
            ? "Overdue Follow-ups"
            : queueFilter === "needs_approval"
              ? "Needs Approval"
              : "All Clients";
  const managerReportUrl = `/api/sub-admin/report?queue=${encodeURIComponent(queueFilter)}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&country=${encodeURIComponent(country)}&course=${encodeURIComponent(course)}${locationQuery}`;
  const subAdminNewInquiryBaseHref =
    inquiryLocation === "all"
      ? "/dashboard/sub-admin?tab=overview"
      : `/dashboard/sub-admin?tab=overview&inquiryLocation=${encodeURIComponent(inquiryLocation)}`;
  const subAdminUnassignedQueueHref =
    inquiryLocation === "all"
      ? "/dashboard/sub-admin?tab=students&queue=unassigned"
      : `/dashboard/sub-admin?tab=students&queue=unassigned&inquiryLocation=${encodeURIComponent(inquiryLocation)}`;
  const subAdminCaseListHrefBase = `/dashboard/sub-admin?tab=students&queue=${encodeURIComponent(queueFilter)}&stage=${encodeURIComponent(stageFilter)}&search=${encodeURIComponent(search)}&status=${encodeURIComponent(status)}&country=${encodeURIComponent(country)}&course=${encodeURIComponent(course)}`;
  const trendBuckets = buildWeeklyTrendBuckets(trendSubmissions);
  const avgReviewHours = calculateAverageReviewHours(trendSubmissions);
  const conversionRate =
    submissions.length > 0 ? Math.round((enrolledItems.length / submissions.length) * 100) : 0;
  const pendingRatio = submissions.length > 0 ? Math.round((pendingItems.length / submissions.length) * 100) : 0;
  const highVisaRiskItems = activeSubmissionItems.filter((item) => {
    const visaExpiryDate = item.student.studentProfile?.visaExpiryDate;
    if (!visaExpiryDate) return false;
    const days = daysUntilDate(visaExpiryDate, today);
    return days >= 0 && days <= 30;
  });
  const missingFollowUpItems = activeSubmissionItems.filter((item) => {
    const needsFollowUp = ["SUBMITTED", "UNDER_REVIEW", "DOCS_REQUESTED", "OFFER_RECEIVED"].includes(item.status);
    if (!needsFollowUp) return false;
    return !item.student.studentProfile?.nextFollowUpDate;
  });
  const pendingDocRiskItems = activeSubmissionItems.filter((item) => {
    const profileId = item.student.studentProfile?.id;
    return profileId ? approvalProfileSet.has(profileId) : false;
  });
  const pendingApprovalsPreview = pendingDocRiskItems.slice(0, 2).map(
    (item) => item.student.name ?? item.student.email,
  );
  const unassignedPreview = unassignedItems.slice(0, 2).map(
    (item) => item.student.name ?? item.student.email,
  );
  const teamOverloadedPreview = staffWorkloads
    .filter((staff) => staff.openTasks >= 8 || staff.activeCases >= 15)
    .slice(0, 2)
    .map((staff) => `${staff.name} - ${staff.openTasks} tasks / ${staff.activeCases} cases`);
  const overdueFollowUpsPreview = activeSubmissionItems
    .filter((item) => {
      const next = item.student.studentProfile?.nextFollowUpDate;
      return next ? daysUntilDate(next, today) < 0 : false;
    })
    .slice(0, 2)
    .map((item) => item.student.name ?? item.student.email);
  const teamMembersPreview = teamMembers
    .slice(0, 2)
    .map((member) => member.internalStaff.name ?? member.internalStaff.email);
  return (
    <section className="space-y-6">
      <DashboardProfileHeader
        name={session.user.name}
        email={session.user.email ?? ""}
        roleLabel={isAdminViewer ? "Administrator" : "Agent"}
      />

      <DashboardTabBar
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "students", label: "Cases", count: assignedStudents },
          { id: "visa-outcomes", label: "Visa Outcomes", count: visaOutcomes.length },
          { id: "tasks", label: "Tasks", count: openTaskCount },
          { id: "team", label: "Team & Operations" },
          { id: "contributions", label: "Contributions" },
          { id: "deleted-clients", label: "Deleted Clients", count: deletedClientsCount },
        ]}
        activeTab={tab}
      />

      <Suspense fallback={null}>
        <DelegationSuccessToast />
      </Suspense>

      {/* ── OVERVIEW TAB ───────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {reminders.length > 0 && (
            <RemindersWidget reminders={reminders} title="Reminders" maxItems={8} />
          )}

          <NewInquiriesCard
            inquiries={newInquiries}
            last24hCount={newInquiriesLast24hCount}
            locationFilter={inquiryLocation}
            claimAction={claimSubmissionAction}
            filterHrefBase={subAdminNewInquiryBaseHref}
            viewAllHref={subAdminUnassignedQueueHref}
          />

          <section className="grid gap-4 md:grid-cols-5">
            <StatCard
              title="Pending Approvals"
              value={String(pendingApprovalsCount)}
              preview={pendingApprovalsPreview}
            />
            <StatCard
              title="Unassigned Cases"
              value={String(unassignedItems.length)}
              preview={unassignedPreview}
            />
            <StatCard
              title="Team Overloaded"
              value={String(overloadedStaffCount)}
              preview={teamOverloadedPreview}
            />
            <StatCard
              title="Overdue Follow-ups"
              value={String(overdueFollowUpsCount)}
              preview={overdueFollowUpsPreview}
            />
            <StatCard
              title="Team Members"
              value={String(teamMembers.length)}
              preview={teamMembersPreview}
            />
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Case Stage Funnel</h2>
                <p className="mt-1 text-xs text-gray-600">
                  {stageTotal} client{stageTotal === 1 ? "" : "s"} across the workflow
                </p>
              </div>
            </div>
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Funnel view</p>
              <ul className="mt-2 space-y-1.5">
                {caseStageOrder.map((stage) => {
                  const item = stageCounts.find((c) => c.stage === stage);
                  const count = item?.count ?? 0;
                  const pct = stageTotal === 0 ? 0 : Math.round((count / stageTotal) * 100);
                  return (
                    <li key={`${stage}-funnel`} className="flex items-center gap-3">
                      <div className="w-48 shrink-0 text-xs font-medium text-gray-700">
                        {caseStageLabel(stage)}
                      </div>
                      <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-gray-100">
                        <div
                          className="h-full rounded-md bg-gradient-to-r from-rose-400 to-blue-500"
                          style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }}
                        />
                      </div>
                      <div className="w-20 shrink-0 text-right text-xs font-semibold text-gray-700">
                        {count} ({pct}%)
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Workflow stages</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
                {caseStageOrder.map((stage) => {
                  const item = stageCounts.find((c) => c.stage === stage);
                  const count = item?.count ?? 0;
                  return (
                    <article
                      key={stage}
                      className={`min-w-[160px] rounded-md border p-3 ${caseStageTone(stage)}`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                        {caseStageLabel(stage)}
                      </p>
                      <p className="mt-1 text-xl font-semibold">{count}</p>
                    </article>
                  );
                })}
              </div>
            </div>
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Outcomes / end states</p>
              <div className="mt-2 flex gap-2 overflow-x-auto pb-2">
                {caseStageTerminals.map((stage) => {
                  const item = stageCounts.find((c) => c.stage === stage);
                  const count = item?.count ?? 0;
                  return (
                    <article
                      key={stage}
                      className={`min-w-[160px] rounded-md border p-3 ${caseStageTone(stage)}`}
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                        {caseStageLabel(stage)}
                      </p>
                      <p className="mt-1 text-xl font-semibold">{count}</p>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">Manager Analytics</h2>
                <p className="mt-1 text-xs text-gray-600">Weekly health and operational performance snapshot.</p>
              </div>
              <a href={managerReportUrl} className="rounded-md border px-3 py-1.5 text-xs font-medium">
                Download Weekly Manager Report
              </a>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-4">
              <StatCard title="Conversion Rate (Enrolled)" value={`${conversionRate}%`} />
              <StatCard title="Pending Ratio" value={`${pendingRatio}%`} />
              <StatCard title="Avg Review Time" value={`${avgReviewHours}h`} />
              <StatCard title="Active Cases" value={String(pendingItems.length + offerInProgressItems.length)} />
            </div>
            <div className="mt-3 grid gap-2 md:grid-cols-4">
              {trendBuckets.map((bucket) => (
                <article key={bucket.label} className="rounded-md border border-gray-200 bg-gray-50 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{bucket.label}</p>
                  <p className="mt-1 text-sm text-gray-800">
                    {bucket.submitted} submitted · {bucket.resolved} resolved
                  </p>
                  <p className="text-xs text-gray-600">{bucket.pending} pending</p>
                </article>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <article className="rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold">Risk Board</h2>
              <p className="mt-1 text-xs text-gray-600">High-priority cases needing intervention.</p>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <RiskBucket
                  title="Visa Expiring <=30d"
                  items={highVisaRiskItems}
                  emptyLabel="No critical visa expiries."
                />
                <RiskBucket
                  title="Missing Follow-up Date"
                  items={missingFollowUpItems}
                  emptyLabel="All tracked cases have follow-up dates."
                />
                <RiskBucket
                  title="Pending Docs/Approvals"
                  items={pendingDocRiskItems}
                  emptyLabel="No pending approval risk."
                />
              </div>
            </article>

          </section>
        </div>
      )}

      {tab === "tasks" && (
        <StaffDashboardTasks
          tasks={agentTasks}
          assigneeOptions={taskAssigneeOptions}
          bulkUpdateTasksAction={bulkUpdateTasksFromSubAdminDashboardAction}
          reassignTaskAction={reassignTaskFromSubAdminDashboardAction}
          updateTaskStatusAction={updateTaskStatusFromSubAdminDashboardAction}
          returnTab="tasks"
          taskView={taskView}
          openCount={openTaskCount}
          completedCount={completedTaskCount}
          viewHrefBase="/dashboard/sub-admin?tab=tasks"
        />
      )}

      {tab === "visa-outcomes" && <VisaOutcomesPanel outcomes={visaOutcomes} />}

      {/* ── STUDENTS TAB ───────────────────────────────────────── */}
      {tab === "students" && (
        <div className="space-y-6">
          <section className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
            <h2 className="text-sm font-semibold text-blue-950">Cases</h2>
            <p className="mt-1 text-sm text-blue-900">
              Every active client in the system — unclaimed, claimed by you, claimed by another agent, or
              delegated to case managers. Delegated cases stay on this list with a clear status badge.
            </p>
          </section>

          {session.user.role === "SUB_ADMIN" ? (
            <StudentClientIntakeForm
              action={createManualStudentAction}
              error={manualStudentError}
              success={manualStudentSuccess}
              successType={manualStudentSuccessType}
              description="Add a new client, choose their visa service, and assign the case to yourself."
            />
          ) : null}

          {claimErrorMessage ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              {claimErrorMessage}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-5">
            <StatCard title="All Clients" value={String(assignedStudents)} />
            <StatCard title="My Cases" value={String(myCaseCount)} />
            <StatCard title="Delegated to Staff" value={String(delegatedCaseCount)} />
            <StatCard title="Pending Reviews" value={String(pendingReviews)} />
            <StatCard title="Visa Expiring <=90d" value={String(visaExpiringSoon)} />
          </div>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Saved Triage Filters</h2>
              <p className="text-xs text-gray-600">Current: {queueFilterLabel}</p>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              <QueueFilterButton label="All Clients" queue="all" current={queueFilter} tab="students" locationFilter={inquiryLocation} />
              <QueueFilterButton label="Unassigned" queue="unassigned" current={queueFilter} tab="students" locationFilter={inquiryLocation} />
              <QueueFilterButton label="My Cases" queue="my_cases" current={queueFilter} tab="students" locationFilter={inquiryLocation} />
              <QueueFilterButton label="Delegated" queue="delegated" current={queueFilter} tab="students" locationFilter={inquiryLocation} />
              <QueueFilterButton label="Overdue" queue="overdue" current={queueFilter} tab="students" locationFilter={inquiryLocation} />
              <QueueFilterButton label="Needs Approval" queue="needs_approval" current={queueFilter} tab="students" locationFilter={inquiryLocation} />
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Filter by Case Stage</h2>
              <p className="text-xs text-gray-600">
                {stageFilter
                  ? `Showing: ${caseStageLabel(stageFilter as CaseStage)}`
                  : "Showing all stages"}
              </p>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <StageFilterChip label="All Stages" stage="" current={stageFilter} queue={queueFilter} locationFilter={inquiryLocation} />
              {caseStageOrder.map((stage) => (
                <StageFilterChip
                  key={stage}
                  label={caseStageLabel(stage)}
                  stage={stage}
                  current={stageFilter}
                  queue={queueFilter}
                  locationFilter={inquiryLocation}
                />
              ))}
            </div>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Cases categorized by priority</h2>
            <p className="mt-1 text-xs text-gray-600">
              Click any client to open profile and update details.
            </p>
            <div className="mt-3 max-h-[28rem] overflow-y-auto pr-1">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <CategoryCard
                  title="Visa Expiring Soon (<=90d)"
                  items={visaExpiringSoonItems}
                  emptyLabel="No clients with upcoming visa expiry."
                />
                <CategoryCard
                  title="Auto Follow-up (Visa or follow-up in 4-5 months)"
                  items={autoFollowUpItems}
                  emptyLabel="No clients currently in the 4-5 month follow-up window."
                />
                <CategoryCard
                  title="Pending Review"
                  items={pendingItems}
                  emptyLabel="No clients in pending stage."
                />
                <CategoryCard
                  title="Offer In Progress"
                  items={offerInProgressItems}
                  emptyLabel="No clients in offer processing stage."
                />
                <CategoryCard
                  title="Enrolled"
                  items={enrolledItems}
                  emptyLabel="No enrolled clients in this view."
                />
                <CategoryCard
                  title="Rejected"
                  items={rejectedItems}
                  emptyLabel="No rejected clients in this view."
                />
              </div>
            </div>
          </section>

          <form method="GET" className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">Filter submissions</p>
              <a href={exportUrl} className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                Export filtered CSV
              </a>
            </div>
            <input type="hidden" name="tab" value="students" />
            <input type="hidden" name="queue" value={queueFilter} />
            <input type="hidden" name="stage" value={stageFilter} />
            <input type="hidden" name="inquiryLocation" value={inquiryLocation} />
            <div className="mt-3 grid gap-3 md:grid-cols-5">
              <input
                name="search"
                defaultValue={search}
                className="rounded-md border px-3 py-2 text-sm"
                placeholder="Search name, case ref, city, course"
              />
              <select name="status" defaultValue={status} className="rounded-md border px-3 py-2 text-sm">
                <option value="">All statuses</option>
                <option value="SUBMITTED">Submitted</option>
                <option value="UNDER_REVIEW">Under Review</option>
                <option value="DOCS_REQUESTED">Docs Requested</option>
                <option value="OFFER_RECEIVED">Offer Received</option>
                <option value="VISA_GRANTED">Visa Granted</option>
                <option value="REJECTED">Rejected</option>
                <option value="ENROLLED">Enrolled</option>
              </select>
              <input
                name="country"
                defaultValue={country}
                className="rounded-md border px-3 py-2 text-sm"
                placeholder="Country"
              />
              <input
                name="course"
                defaultValue={course}
                className="rounded-md border px-3 py-2 text-sm"
                placeholder="Course"
              />
              <button type="submit" className="rounded-md bg-black px-3 py-2 text-sm text-white">
                Apply
              </button>
            </div>
          </form>

          <div className="rounded-lg border bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-semibold">Case list</h2>
                <LocationFilterButtons
                  active={inquiryLocation}
                  hrefBase={subAdminCaseListHrefBase}
                />
              </div>
              <p className="text-xs text-gray-600">
                {filteredSubmissions.length} results · filter: {queueFilterLabel}
              </p>
            </div>
            {filteredSubmissions.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No submissions in this queue.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <form
                  id="bulk-submission-status-form"
                  action={bulkUpdateSubmissionStatusAction}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-2"
                >
                  <select
                    name="status"
                    required
                    className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
                    defaultValue="UNDER_REVIEW"
                  >
                    {submissionStatuses.map((statusItem) => (
                      <option key={statusItem} value={statusItem}>
                        {formatSubmissionStatus(statusItem)}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="rounded-md border border-gray-300 bg-white px-3 py-1 text-sm">
                    Apply status to selected
                  </button>
                </form>
                <div className="max-h-96 space-y-3 overflow-y-auto pr-1">
                {filteredSubmissions.map((submission) => {
                  const activeInternalDelegations =
                    submission.student.studentProfile?.assignments.filter(
                      (assignment) => assignment.assignedTo.role === "INTERNAL_STAFF",
                    ) ?? [];
                  const activeInternalDelegationIds = new Set(
                    activeInternalDelegations.map((assignment) => assignment.assignedToId),
                  );
                  const showWorkloadSuggestionBadge =
                    activeInternalDelegationIds.size === 0 && Boolean(suggestedAssigneeId);
                  const isUnclaimed = submission.assignedToId === null;
                  const isMyCase = submission.assignedToId === session.user.id;
                  // Option A + open delegation: any sub-admin (or admin) can
                  // manage any case so offices can help each other.
                  const canManageCase = isAdminViewer || session.user.role === "SUB_ADMIN";

                  return (
                  <article id={`submission-${submission.id}`} key={submission.id} className="rounded-md border border-gray-200 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <label className="mb-1 flex items-center gap-2 text-xs text-gray-700">
                          <input
                            type="checkbox"
                            name="submissionIds"
                            value={submission.id}
                            form="bulk-submission-status-form"
                            className="h-4 w-4"
                          />
                          Select for bulk update
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold">
                            {submission.student.name ?? submission.student.email}
                          </p>
                          <CaseReferenceLabel
                            caseReference={submission.student.studentProfile?.caseReference}
                          />
                          <AgentStudentCaseBadge
                            assignedToId={submission.assignedToId}
                            assignedSubAdmin={submission.assignedSubAdmin}
                            currentAgentId={session.user.id}
                            hasStaffDelegation={activeInternalDelegations.length > 0}
                          />
                        </div>
                        <p className="text-xs text-gray-600">
                          {formatSubmissionServiceSummary({
                            intendedCourse: submission.intendedCourse,
                            answers: submission.answers,
                            profileVisaServiceType:
                              submission.student.studentProfile?.visaServiceType,
                            profileOtherServiceDescription:
                              submission.student.studentProfile?.otherServiceDescription,
                          })}{" "}
                          | {submission.sourceCity ?? "City unknown"},{" "}
                          {submission.sourceCountry ?? "Country unknown"}
                        </p>
                        <p className="text-xs text-gray-600">
                          Current status: {formatSubmissionStatus(submission.status)}
                        </p>
                        {activeInternalDelegations.length > 0 ? (
                          <p className="text-xs font-medium text-indigo-800">
                            Delegated to case manager
                            {activeInternalDelegations.length === 1 ? "" : "s"}:{" "}
                            {activeInternalDelegations
                              .map((assignment) => assignment.assignedTo.name ?? assignment.assignedTo.email)
                              .join(", ")}
                          </p>
                        ) : isMyCase ? (
                          <p className="text-xs text-gray-600">Not delegated to case managers yet</p>
                        ) : null}
                        {submission.student.studentProfile ? (
                          <p className="mt-1">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${caseStageTone(submission.student.studentProfile.caseStage)}`}
                            >
                              Stage: {caseStageLabel(submission.student.studentProfile.caseStage)}
                            </span>
                          </p>
                        ) : null}
                        <p className="text-xs text-gray-600">
                          Visa:{" "}
                          {submission.student.studentProfile
                            ? formatVisaStatus(submission.student.studentProfile.visaStatus)
                            : "Not set"}{" "}
                          | Years left: {formatYearsLeft(submission.student.studentProfile?.courseEndDate)}
                        </p>
                        <p className="text-xs text-gray-600">
                          Next follow-up:{" "}
                          {submission.student.studentProfile?.nextFollowUpDate
                            ? submission.student.studentProfile.nextFollowUpDate.toLocaleDateString()
                            : "Not scheduled"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/students/${submission.studentId}`}
                          className="rounded-md border border-gray-300 px-3 py-1 text-sm"
                        >
                          View profile
                        </Link>
                        {isUnclaimed ? (
                          <form action={claimSubmissionAction}>
                            <input type="hidden" name="submissionId" value={submission.id} />
                            <button
                              type="submit"
                              className="rounded-md border border-emerald-400 bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-900"
                            >
                              Claim case
                            </button>
                          </form>
                        ) : null}
                        {canManageCase ? (
                        <form action={updateSubmissionStatusAction} className="flex items-center gap-2">
                          <input type="hidden" name="submissionId" value={submission.id} />
                          <input type="hidden" name="anchorId" value={`submission-${submission.id}`} />
                          <select
                            name="status"
                            defaultValue={submission.status}
                            className="rounded-md border px-2 py-1 text-sm"
                          >
                            {submissionStatuses.map((status) => (
                              <option key={status} value={status}>
                                {formatSubmissionStatus(status)}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="rounded-md bg-black px-3 py-1 text-sm text-white">
                            Update
                          </button>
                        </form>
                        ) : null}
                        {canManageCase && allInternalStaff.length > 0 && submission.student.studentProfile ? (
                          <form action={delegateStudentToInternalStaffAction} className="relative w-full sm:w-auto">
                            <input type="hidden" name="studentId" value={submission.studentId} />
                            <input type="hidden" name="anchorId" value={`submission-${submission.id}`} />
                            <details className="relative">
                              <summary className="w-full cursor-pointer list-none rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-800 transition hover:bg-gray-50 sm:w-auto">
                                Delegate to staff
                              </summary>
                              <div className="absolute left-0 right-0 z-20 mt-2 max-h-72 overflow-y-auto rounded-md border border-gray-200 bg-white p-3 shadow-lg sm:left-auto sm:w-72">
                                <div className="space-y-1">
                                  {allInternalStaff.map((staff) => (
                                    <label key={staff.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                                      <input
                                        type="checkbox"
                                        name="internalStaffIds"
                                        value={staff.id}
                                        defaultChecked={
                                          activeInternalDelegationIds.has(staff.id) ||
                                          (showWorkloadSuggestionBadge && staff.id === suggestedAssigneeId)
                                        }
                                        className="h-4 w-4 shrink-0"
                                      />
                                      <span className="min-w-0 truncate">
                                        {(staff.name ?? staff.email) +
                                          (showWorkloadSuggestionBadge && staff.id === suggestedAssigneeId
                                            ? " (Suggested)"
                                            : "")}
                                      </span>
                                    </label>
                                  ))}
                                </div>
                                <button type="submit" className="mt-3 w-full rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-gray-50">
                                  Update delegation
                                </button>
                              </div>
                            </details>
                          </form>
                        ) : null}
                      </div>
                    </div>
                  </article>
                  );
                })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TEAM & OPERATIONS TAB ──────────────────────────────── */}
      {tab === "team" && (
        <div className="space-y-6">
          <section className="grid gap-4 lg:grid-cols-3">
            <article className="rounded-lg border bg-white p-4">
              <h2 className="text-sm font-semibold">Approval Queue</h2>
              <p className="mt-1 text-xs text-gray-600">Items waiting for review or send decision.</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
                  <span>Draft Contracts</span>
                  <span className="font-semibold">{draftContractsCount}</span>
                </li>
                <li className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
                  <span>Draft Invoices</span>
                  <span className="font-semibold">{draftInvoicesCount}</span>
                </li>
                <li className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
                  <span>Pending Doc Verification</span>
                  <span className="font-semibold">{pendingDocumentsCount}</span>
                </li>
              </ul>
              <Link href="/dashboard/communication" className="mt-3 inline-block rounded-md border px-3 py-1.5 text-xs">
                Open internal comms
              </Link>
            </article>

            <article className="rounded-lg border bg-white p-4 lg:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Assignment Board</h2>
                <p className="text-xs text-gray-600">Unassigned cases and team workload</p>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-gray-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Unassigned Cases</p>
                  {unassignedItems.length === 0 ? (
                    <p className="mt-2 text-xs text-gray-600">No unassigned cases.</p>
                  ) : (
                    <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                      {unassignedItems.slice(0, 10).map((item) => (
                        <li key={item.id} className="rounded-md border border-gray-200 p-2">
                          <p className="text-xs font-semibold">{item.student.name ?? item.student.email}</p>
                          <p className="text-[11px] text-gray-600">{formatSubmissionStatus(item.status)}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <Link
                              href={`/dashboard/students/${item.studentId}`}
                              className="rounded-md border border-gray-300 px-2 py-1 text-[11px]"
                            >
                              Open
                            </Link>
                            <form action={claimSubmissionAction}>
                              <input type="hidden" name="submissionId" value={item.id} />
                              <button type="submit" className="rounded-md border border-gray-300 px-2 py-1 text-[11px]">
                                Claim
                              </button>
                            </form>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-md border border-gray-200 p-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Team Workload</p>
                  {staffWorkloads.length === 0 ? (
                    <p className="mt-2 text-xs text-gray-600">No internal staff members linked.</p>
                  ) : (
                    <ul className="mt-2 max-h-52 space-y-2 overflow-y-auto pr-1">
                      {staffWorkloads.map((staff) => (
                        <li key={staff.id} className="rounded-md border border-gray-200 p-2">
                          <p className="text-xs font-semibold">{staff.name}</p>
                          <p className="text-[11px] text-gray-600">
                            {staff.activeCases} active cases · {staff.openTasks} open tasks
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </article>
          </section>

          <section className="rounded-lg border bg-white p-4">
            <h2 className="text-sm font-semibold">Delegation Snapshot</h2>
            <p className="mt-1 text-xs text-gray-600">
              Team members linked to you: {teamMembers.length}
            </p>
            {activeAssignments.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No delegated student assignments yet.</p>
            ) : (
              <ul className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
                {activeAssignments.map((assignment) => (
                  <li key={assignment.id} className="rounded-md border border-gray-200 p-2">
                    <p className="text-sm font-medium">
                      {assignment.studentProfile.user.name ?? assignment.studentProfile.user.email}
                    </p>
                    <p className="text-xs text-gray-600">
                      Assigned to {assignment.assignedTo.name ?? assignment.assignedTo.email}
                    </p>
                    <Link href={`/dashboard/students/${assignment.studentProfile.user.id}`} className="mt-1 inline-block text-xs text-blue-600 underline">
                      Open client profile
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-lg border bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold">Your Home Page Posts</h2>
              <Link href="/dashboard/posts/new" className="rounded-md border px-3 py-1 text-sm">
                New post
              </Link>
            </div>
            {homePosts.length === 0 ? (
              <p className="mt-2 text-sm text-gray-600">No posts yet.</p>
            ) : (
              <div className="mt-3 overflow-x-auto pb-2">
                <div className="flex min-w-max gap-3">
                {homePosts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/dashboard/posts/${post.id}/edit`}
                    className="w-64 shrink-0 rounded-md border border-gray-200 p-2 transition hover:border-rose-300"
                  >
                    <div className="h-28 overflow-hidden rounded-md border bg-gray-50">
                      {post.mediaType === "IMAGE" && post.mediaUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={post.mediaUrl} alt={post.title} className="h-full w-full object-cover" />
                      ) : post.mediaType === "VIDEO" && post.mediaUrl ? (
                        <div className="flex h-full items-center justify-center text-xs text-gray-600">
                          Video post
                        </div>
                      ) : (
                        <div className="flex h-full items-center justify-center text-xs text-gray-600">
                          Text post
                        </div>
                      )}
                    </div>
                    <p className="mt-2 line-clamp-1 text-sm font-semibold">{post.title}</p>
                    <p className="text-xs text-gray-600">
                      {post.author.name ?? post.author.email} · {post.createdAt.toLocaleDateString()}
                    </p>
                  </Link>
                ))}
                </div>
              </div>
            )}
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <Link href="/dashboard/communication" className="rounded-md border px-3 py-2 text-sm">
              Internal communication
            </Link>
            <a href={exportUrl} className="rounded-md border px-3 py-2 text-sm">
              Export filtered CSV
            </a>
            {session.user.role === "ADMIN" ? (
              <Link href="/dashboard/admin" className="rounded-md border px-3 py-2 text-sm">
                Go to admin dashboard
              </Link>
            ) : null}
          </div>
        </div>
      )}

      {/* ── CONTRIBUTIONS TAB ──────────────────────────────────── */}
      {tab === "deleted-clients" && (
        <DeletedClientsTab
          clients={deletedClients}
          isAdmin={isAdminViewer}
          returnPath="/dashboard/sub-admin?tab=deleted-clients"
          restoreDeletedClientAction={restoreDeletedClientAction}
          permanentDeleteDeletedClientAction={permanentDeleteDeletedClientAction}
          blobOpensThroughAuthenticatedApi={blobOpensThroughAuthenticatedApi()}
        />
      )}

      {tab === "contributions" && <ContributionsTabSection />}
    </section>
  );
}

function dedupeLatestSubmissionPerStudent<T extends { studentId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    if (seen.has(item.studentId)) continue;
    seen.add(item.studentId);
    deduped.push(item);
  }
  return deduped;
}

function daysUntilDate(targetDate: Date, now: Date) {
  const current = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
  );
  return Math.round((target.getTime() - current.getTime()) / (1000 * 60 * 60 * 24));
}

function calculateAverageReviewHours(
  items: Array<{ status: SubmissionStatus; submittedAt: Date; updatedAt: Date }>,
) {
  const completed = items.filter((item) => ["ENROLLED", "REJECTED", "VISA_GRANTED"].includes(item.status));
  if (completed.length === 0) return 0;
  const totalHours = completed.reduce((sum, item) => {
    const diffMs = item.updatedAt.getTime() - item.submittedAt.getTime();
    return sum + Math.max(0, diffMs / (1000 * 60 * 60));
  }, 0);
  return Math.round(totalHours / completed.length);
}

function buildWeeklyTrendBuckets(
  items: Array<{ status: SubmissionStatus; submittedAt: Date; updatedAt: Date }>,
) {
  const labels = ["Wk-4", "Wk-3", "Wk-2", "Wk-1"];
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekMs = 1000 * 60 * 60 * 24 * 7;

  return labels.map((label, index) => {
    const start = new Date(startOfToday.getTime() - weekMs * (4 - index));
    const end = new Date(start.getTime() + weekMs);
    const submitted = items.filter(
      (item) => item.submittedAt.getTime() >= start.getTime() && item.submittedAt.getTime() < end.getTime(),
    ).length;
    const resolved = items.filter(
      (item) =>
        item.updatedAt.getTime() >= start.getTime() &&
        item.updatedAt.getTime() < end.getTime() &&
        ["ENROLLED", "REJECTED", "VISA_GRANTED"].includes(item.status),
    ).length;
    return {
      label,
      submitted,
      resolved,
      pending: Math.max(0, submitted - resolved),
    };
  });
}

function CategoryCard({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: Array<{
    studentId: string;
    status: SubmissionStatus;
      student: {
        name: string | null;
        email: string;
        studentProfile: { visaExpiryDate: Date | null; caseReference: string } | null;
      };
  }>;
  emptyLabel: string;
}) {
  return (
    <article className="rounded-md border border-gray-200 p-3">
      <p className="text-sm font-semibold">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-gray-600">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 max-h-56 space-y-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <li key={`${item.studentId}-${item.status}`}>
              <Link
                href={`/dashboard/students/${item.studentId}`}
                className="block rounded-md border border-gray-200 px-2 py-1.5 text-xs transition hover:border-rose-300 hover:bg-rose-50/40"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{item.student.name ?? item.student.email}</p>
                  <CaseReferenceLabel caseReference={item.student.studentProfile?.caseReference} />
                </div>
                <p className="text-gray-600">
                  {formatSubmissionStatus(item.status)}
                  {item.student.studentProfile?.visaExpiryDate
                    ? ` · Visa expiry ${item.student.studentProfile.visaExpiryDate.toLocaleDateString()}`
                    : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}

function RiskBucket({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: Array<{
    id: string;
    studentId: string;
    student: { name: string | null; email: string };
    status: SubmissionStatus;
  }>;
  emptyLabel: string;
}) {
  return (
    <section className="rounded-md border border-gray-200 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-gray-600">{emptyLabel}</p>
      ) : (
        <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto pr-1">
          {items.slice(0, 12).map((item) => (
            <li key={item.id}>
              <Link
                href={`/dashboard/students/${item.studentId}`}
                className="block rounded-md border border-gray-200 px-2 py-1 text-xs transition hover:border-rose-300"
              >
                <p className="font-semibold">{item.student.name ?? item.student.email}</p>
                <p className="text-gray-600">{formatSubmissionStatus(item.status)}</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function StatCard({ title, value, preview }: { title: string; value: string; preview?: string[] }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {preview && preview.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs text-slate-600">
          {preview.map((line, idx) => (
            <li key={`${idx}-${line}`} className="truncate" title={line}>
              - {line}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-slate-500">No items yet</p>
      )}
    </article>
  );
}

function AgentStudentCaseBadge({
  assignedToId,
  assignedSubAdmin,
  currentAgentId,
  hasStaffDelegation,
}: {
  assignedToId: string | null;
  assignedSubAdmin: { id: string; name: string | null; email: string } | null;
  currentAgentId: string;
  hasStaffDelegation: boolean;
}) {
  if (assignedToId === null) {
    return (
      <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900">
        Unclaimed
      </span>
    );
  }
  if (assignedToId === currentAgentId) {
    return (
      <span
        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
          hasStaffDelegation
            ? "border-indigo-300 bg-indigo-50 text-indigo-900"
            : "border-emerald-300 bg-emerald-50 text-emerald-900"
        }`}
      >
        {hasStaffDelegation ? "Delegated" : "Your case"}
      </span>
    );
  }
  const agentLabel = assignedSubAdmin?.name?.trim() || assignedSubAdmin?.email || "Another agent";
  return (
    <span className="inline-flex rounded-full border border-slate-300 bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
      Claimed · {agentLabel}
    </span>
  );
}

function QueueFilterButton({
  label,
  queue,
  current,
  tab,
  locationFilter,
}: {
  label: string;
  queue: "all" | "unassigned" | "my_cases" | "delegated" | "overdue" | "needs_approval";
  current: "all" | "unassigned" | "my_cases" | "delegated" | "overdue" | "needs_approval";
  tab: string;
  locationFilter: "all" | "onshore" | "offshore";
}) {
  const base = `/dashboard/sub-admin?tab=${tab}`;
  const locationQuery =
    locationFilter === "all" ? "" : `&inquiryLocation=${encodeURIComponent(locationFilter)}`;
  return (
    <Link
      href={queue === "all" ? `${base}${locationQuery}` : `${base}&queue=${queue}${locationQuery}`}
      className={`rounded-md border px-3 py-2 text-sm ${
        current === queue
          ? "border-blue-600 bg-blue-600 text-white"
          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
      }`}
    >
      {label}
    </Link>
  );
}

function StageFilterChip({
  label,
  stage,
  current,
  queue,
  locationFilter,
}: {
  label: string;
  stage: CaseStage | "";
  current: CaseStage | "";
  queue: "all" | "unassigned" | "my_cases" | "delegated" | "overdue" | "needs_approval";
  locationFilter: "all" | "onshore" | "offshore";
}) {
  const isActive = current === stage;
  const base = "/dashboard/sub-admin?tab=students";
  const queueQuery = queue === "all" ? "" : `&queue=${queue}`;
  const locationQuery =
    locationFilter === "all" ? "" : `&inquiryLocation=${encodeURIComponent(locationFilter)}`;
  const href = stage === "" ? `${base}${queueQuery}${locationQuery}` : `${base}${queueQuery}&stage=${stage}${locationQuery}`;
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        isActive
          ? "border-slate-900 bg-slate-900 text-white"
          : `${stage ? caseStageTone(stage) : "border-slate-300 bg-white text-slate-700"} hover:border-slate-400`
      }`}
    >
      {label}
    </Link>
  );
}

function subAdminDashboardPath(tab = "tasks", taskView?: string) {
  return `/dashboard/sub-admin?tab=${tab}${taskView === "completed" ? "&taskView=completed" : ""}`;
}

async function updateTaskStatusFromSubAdminDashboardAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN") {
    redirect("/dashboard");
  }

  const taskId = String(formData.get("taskId") ?? "");
  const statusRaw = String(formData.get("status") ?? "TODO") as TaskStatus;
  const status: TaskStatus = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].includes(statusRaw)
    ? statusRaw
    : "TODO";
  const returnTab = String(formData.get("returnTab") ?? "tasks");
  const returnView = String(formData.get("returnView") ?? "");
  if (!taskId) redirect(subAdminDashboardPath(returnTab, returnView));

  const task = await prisma.task.findUnique({
    where: { id: taskId },
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
  if (!task) redirect(subAdminDashboardPath(returnTab, returnView));

  if (
    !userCanManageTask(
      { id: session.user.id, role: session.user.role },
      {
        assigneeId: task.assigneeId,
        assignerId: task.assignerId,
        studentProfile: task.studentProfile,
      },
    )
  ) {
    redirect(subAdminDashboardPath(returnTab, returnView));
  }

  await prisma.task.update({
    where: { id: task.id },
    data:
      status === "DONE"
        ? { status, completedById: session.user.id, completedAt: new Date() }
        : { status, completedById: null, completedAt: null },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: task.studentProfileId,
      entityType: "TASK",
      entityId: task.id,
      action: `Updated task status from agent dashboard to ${status}`,
    },
  });

  revalidateContributionsCache(task.studentProfile.userId);
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  revalidatePath(`/dashboard/students/${task.studentProfile.userId}`);
  redirect(subAdminDashboardPath(returnTab, returnView));
}

async function reassignTaskFromSubAdminDashboardAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN") {
    redirect("/dashboard");
  }

  const taskId = String(formData.get("taskId") ?? "");
  const assigneeId = String(formData.get("assigneeId") ?? "");
  const returnTab = String(formData.get("returnTab") ?? "tasks");
  const returnView = String(formData.get("returnView") ?? "");
  if (!taskId || !assigneeId) redirect(subAdminDashboardPath(returnTab, returnView));

  const result = await executeTaskReassignment({
    taskId,
    newAssigneeId: assigneeId,
    actor: { id: session.user.id, role: session.user.role },
  });

  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  if (result.ok) {
    revalidatePath(`/dashboard/students/${result.studentUserId}`);
  }
  redirect(
    `${subAdminDashboardPath(returnTab, returnView)}${result.ok && result.changed ? "&taskReassigned=1" : ""}`,
  );
}

async function bulkUpdateTasksFromSubAdminDashboardAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN" && session.user.role !== "SUB_ADMIN") {
    redirect("/dashboard");
  }

  const taskIds = formData
    .getAll("taskIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  const statusRaw = String(formData.get("status") ?? "TODO") as TaskStatus;
  const status: TaskStatus = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].includes(statusRaw)
    ? statusRaw
    : "TODO";
  const returnTab = String(formData.get("returnTab") ?? "tasks");
  const returnView = String(formData.get("returnView") ?? "");
  if (taskIds.length === 0) redirect(subAdminDashboardPath(returnTab, returnView));

  const tasks = await prisma.task.findMany({
    where: { id: { in: taskIds } },
    include: {
      studentProfile: {
        select: {
          userId: true,
          assignments: {
            where: { isActive: true },
            select: { assignedToId: true },
          },
        },
      },
    },
  });
  if (tasks.length === 0) redirect(subAdminDashboardPath(returnTab, returnView));

  const allowedTasks = tasks.filter((task) =>
    userCanManageTask(
      { id: session.user.id, role: session.user.role },
      {
        assigneeId: task.assigneeId,
        assignerId: task.assignerId,
        studentProfile: task.studentProfile,
      },
    ),
  );
  if (allowedTasks.length === 0) redirect(subAdminDashboardPath(returnTab, returnView));

  const allowedTaskIds = allowedTasks.map((task) => task.id);
  await prisma.task.updateMany({
    where: { id: { in: allowedTaskIds } },
    data:
      status === "DONE"
        ? { status, completedById: session.user.id, completedAt: new Date() }
        : { status, completedById: null, completedAt: null },
  });
  await prisma.activityLog.createMany({
    data: allowedTasks.map((task) => ({
      actorId: session.user.id,
      targetStudentProfileId: task.studentProfileId,
      entityType: "TASK",
      entityId: task.id,
      action: `Updated task status from agent dashboard to ${status} (bulk)`,
    })),
  });

  const userIds = Array.from(new Set(allowedTasks.map((task) => task.studentProfile.userId)));
  revalidateContributionsCacheForCases(userIds);
  for (const userId of userIds) {
    revalidatePath(`/dashboard/students/${userId}`);
  }
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  redirect(subAdminDashboardPath(returnTab, returnView));
}

async function updateSubmissionStatusAction(formData: FormData) {
  "use server";
  const returnToStudentsTab = "/dashboard/sub-admin?tab=students";

  const session = await auth();
  if (!session?.user || (session.user.role !== "SUB_ADMIN" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const submissionId = String(formData.get("submissionId") ?? "");
  const anchorId = String(formData.get("anchorId") ?? "").trim();
  const status = String(formData.get("status") ?? "") as SubmissionStatus;

  if (!submissionStatuses.includes(status)) {
    redirect(returnToStudentsTab);
  }

  const submission = await prisma.questionnaireSubmission.findUnique({
    where: { id: submissionId },
    include: {
      student: { include: { studentProfile: { select: { id: true } } } },
    },
  });

  if (!submission) {
    redirect(returnToStudentsTab);
  }

  // Option A: any sub-admin may update any case status. Acting on a still
  // unclaimed case claims it for the actor (claim-on-action).
  await prisma.questionnaireSubmission.update({
    where: { id: submissionId },
    data:
      session.user.role === "SUB_ADMIN" && submission.assignedToId === null
        ? { status, assignedToId: session.user.id }
        : { status },
  });

  if (submission.student.studentProfile?.id) {
    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: submission.student.studentProfile.id,
        entityType: "STUDENT",
        entityId: submission.studentId,
        action: `Updated questionnaire submission status to ${formatSubmissionStatus(status)}`,
        metadata: { submissionId, status },
      },
    });
  }

  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/student");
  await redirectWithDashboardNotice({
    dashboardPath: "/dashboard/sub-admin",
    noticeParams: { statusUpdated: "1" },
    anchorId: anchorId || undefined,
  });
}

async function bulkUpdateSubmissionStatusAction(formData: FormData) {
  "use server";
  const returnToStudentsTab = "/dashboard/sub-admin?tab=students";
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUB_ADMIN" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const status = String(formData.get("status") ?? "") as SubmissionStatus;
  const submissionIds = formData
    .getAll("submissionIds")
    .map((value) => String(value).trim())
    .filter(Boolean);
  if (!submissionStatuses.includes(status) || submissionIds.length === 0) {
    redirect(returnToStudentsTab);
  }

  const submissions = await prisma.questionnaireSubmission.findMany({
    where: { id: { in: submissionIds } },
    include: {
      student: { include: { studentProfile: { select: { id: true } } } },
    },
  });
  if (submissions.length === 0) redirect(returnToStudentsTab);

  // Option A: any sub-admin may bulk-update any case. Acting on still-unclaimed
  // cases claims them for the actor (claim-on-action, handled per row below).
  const allowed = submissions;
  if (allowed.length === 0) redirect(returnToStudentsTab);

  for (const submission of allowed) {
    await prisma.questionnaireSubmission.update({
      where: { id: submission.id },
      data:
        session.user.role === "SUB_ADMIN" && submission.assignedToId === null
          ? { status, assignedToId: session.user.id }
          : { status },
    });

    if (submission.student.studentProfile?.id) {
      await prisma.activityLog.create({
        data: {
          actorId: session.user.id,
          targetStudentProfileId: submission.student.studentProfile.id,
          entityType: "STUDENT",
          entityId: submission.studentId,
          action: `Updated questionnaire submission status to ${formatSubmissionStatus(status)} (bulk)`,
          metadata: { submissionId: submission.id, status },
        },
      });
    }
  }

  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/student");
  redirect(returnToStudentsTab);
}

async function delegateStudentToInternalStaffAction(formData: FormData) {
  "use server";
  const returnToStudentsTab = "/dashboard/sub-admin?tab=students";

  const session = await auth();
  if (!session?.user || (session.user.role !== "SUB_ADMIN" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const studentId = String(formData.get("studentId") ?? "");
  const anchorId = String(formData.get("anchorId") ?? "").trim();
  const selectedStaffIds = Array.from(
    new Set(
      [
        ...formData.getAll("internalStaffIds").map((value) => String(value)),
        String(formData.get("internalStaffId") ?? ""),
      ]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  if (!studentId) redirect(returnToStudentsTab);

  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: {
      id: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!studentProfile) redirect(returnToStudentsTab);

  const staffMembers = await prisma.user.findMany({
    where: { id: { in: selectedStaffIds }, role: "INTERNAL_STAFF", deletedAt: null },
    select: { id: true, name: true, email: true },
  });
  if (selectedStaffIds.length > 0 && staffMembers.length === 0) redirect(returnToStudentsTab);

  const validStaffIds = new Set(staffMembers.map((staff) => staff.id));
  const now = new Date();
  const currentAssignments = await prisma.studentAssignment.findMany({
    where: { studentProfileId: studentProfile.id },
    select: { id: true, assignedToId: true, isActive: true },
  });
  const currentActiveIds = new Set(
    currentAssignments
      .filter((assignment) => assignment.isActive)
      .map((assignment) => assignment.assignedToId),
  );
  await prisma.$transaction(async (tx) => {
    // Only deactivate internal-staff assignments; never touch agent (SUB_ADMIN)
    // team membership from the internal-staff delegation form.
    await tx.studentAssignment.updateMany({
      where: {
        studentProfileId: studentProfile.id,
        isActive: true,
        assignedTo: { role: "INTERNAL_STAFF" },
        assignedToId: { notIn: Array.from(validStaffIds) },
      },
      data: { isActive: false, endedAt: now },
    });

    for (const staffId of validStaffIds) {
      await tx.studentAssignment.upsert({
        where: {
          studentProfileId_assignedToId: {
            studentProfileId: studentProfile.id,
            assignedToId: staffId,
          },
        },
        update: {
          assignedById: session.user.id,
          isActive: true,
          endedAt: null,
        },
        create: {
          studentProfileId: studentProfile.id,
          assignedToId: staffId,
          assignedById: session.user.id,
          isActive: true,
        },
      });
    }
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: studentProfile.id,
      entityType: "ASSIGNMENT",
      entityId: studentProfile.id,
      action: "Updated internal staff delegation (from sub-admin dashboard)",
      metadata: { internalStaffIds: Array.from(validStaffIds) },
    },
  });

  const newlyAssignedStaff = staffMembers.filter((staff) => !currentActiveIds.has(staff.id));
  const removedStaffIds = currentAssignments
    .filter((assignment) => assignment.isActive && !validStaffIds.has(assignment.assignedToId))
    .map((assignment) => assignment.assignedToId);
  const removedStaff =
    removedStaffIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: removedStaffIds }, role: "INTERNAL_STAFF" },
          select: { id: true, name: true, email: true },
        })
      : [];

  await Promise.all([
    ...newlyAssignedStaff.map((staff) =>
      notifyStudentTeamDelegationChange({
        studentProfileId: studentProfile.id,
        studentUserId: studentId,
        actorId: session.user.id,
        assigneeId: staff.id,
        assigneeName: staff.name?.trim() || staff.email,
        assigneeRole: "INTERNAL_STAFF",
        change: "added",
        source: "sub_admin_dashboard",
      }),
    ),
    ...removedStaff.map((staff) =>
      notifyStudentTeamDelegationChange({
        studentProfileId: studentProfile.id,
        studentUserId: studentId,
        actorId: session.user.id,
        assigneeId: staff.id,
        assigneeName: staff.name?.trim() || staff.email,
        assigneeRole: "INTERNAL_STAFF",
        change: "removed",
        source: "sub_admin_dashboard",
      }),
    ),
  ]);

  revalidatePath("/dashboard/sub-admin");
  revalidatePath(`/dashboard/students/${studentId}`);
  revalidatePath("/dashboard/internal-staff");
  revalidateContributionsCache(studentId);

  if (validStaffIds.size === 0) {
    await redirectWithDashboardNotice({
      dashboardPath: "/dashboard/sub-admin",
      noticeParams: { statusUpdated: "1" },
      anchorId: anchorId || undefined,
    });
  } else {
    const staffLabel = staffMembers
      .map((staff) => staff.name?.trim() || staff.email)
      .filter(Boolean)
      .join(", ");
    await redirectWithDelegationNotice({
      dashboardPath: "/dashboard/sub-admin",
      staffLabel: staffLabel || "staff",
      anchorId: anchorId || undefined,
    });
  }
}

async function claimSubmissionAction(formData: FormData) {
  "use server";
  const returnToStudentsTab = "/dashboard/sub-admin?tab=students";
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUB_ADMIN" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const submissionId = String(formData.get("submissionId") ?? "");
  if (!submissionId) redirect(returnToStudentsTab);

  const submission = await prisma.questionnaireSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      assignedToId: true,
      studentId: true,
      student: {
        select: {
          deletedAt: true,
          studentProfile: { select: { id: true } },
        },
      },
    },
  });
  if (!submission) redirect(returnToStudentsTab);

  // Never claim an enquiry from a soft-deleted client (defence-in-depth; the
  // inquiry cards already filter these out).
  if (submission.student.deletedAt) redirect(returnToStudentsTab);

  const previousOwnerId = submission.assignedToId;
  const isAdmin = session.user.role === "ADMIN";

  // Atomic claim: only succeed if the case is unclaimed or already ours. Admins
  // may take over an owned case. This closes the read-then-write race where two
  // agents could both "win" the same enquiry.
  const claimResult = await prisma.questionnaireSubmission.updateMany({
    where: isAdmin
      ? { id: submission.id }
      : { id: submission.id, OR: [{ assignedToId: null }, { assignedToId: session.user.id }] },
    data: { assignedToId: session.user.id },
  });
  if (claimResult.count === 0) {
    // Someone else already owns it (claim is a soft marker; changing the owner
    // is a separate, explicit action reserved for admins).
    redirect(`${returnToStudentsTab}&claimError=taken`);
  }

  // Per-client claim: take ownership of the client's other submissions so a
  // repeat enquiry can't split the case across owners. Admins sweep every
  // submission; agents only adopt the still-unclaimed ones.
  await prisma.questionnaireSubmission.updateMany({
    where: isAdmin
      ? { studentId: submission.studentId }
      : { studentId: submission.studentId, assignedToId: null },
    data: { assignedToId: session.user.id },
  });

  // Accepting a brand-new enquiry moves it into review without downgrading
  // submissions that already progressed further.
  if (previousOwnerId === null) {
    await prisma.questionnaireSubmission.updateMany({
      where: { studentId: submission.studentId, status: "SUBMITTED" },
      data: { status: "UNDER_REVIEW" },
    });
  }

  const studentProfileId = submission.student.studentProfile?.id ?? null;
  if (studentProfileId) {
    await prisma.activityLog.create({
      data: {
        actorId: session.user.id,
        targetStudentProfileId: studentProfileId,
        targetUserId: submission.studentId,
        entityType: "ASSIGNMENT",
        entityId: submission.id,
        action: previousOwnerId && previousOwnerId !== session.user.id
          ? "Reassigned case ownership (claimed)"
          : "Claimed case",
        metadata: { submissionId: submission.id, previousOwnerId },
      },
    });
    // Clear the "new enquiry" action item for the rest of the team.
    await markNewApplicationNotificationsHandled(prisma, studentProfileId);
  }

  // If an admin took the case from another owner, let that owner know.
  if (previousOwnerId && previousOwnerId !== session.user.id && studentProfileId) {
    await createWorkflowNotification({
      recipientId: previousOwnerId,
      actorId: session.user.id,
      studentProfileId,
      type: "STUDENT_DELEGATED",
      title: "Case ownership changed",
      message: "Your claimed case was reassigned to another team member.",
      link: `/dashboard/students/${submission.studentId}?tab=overview`,
      actionRequired: false,
      metadata: { teamNotice: "change_by_actor", reason: "claim_reassigned" },
    });
  }

  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  revalidatePath(`/dashboard/students/${submission.studentId}`);
  revalidateContributionsCache(submission.studentId);
  redirect(returnToStudentsTab);
}
async function escalateSubmissionAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || (session.user.role !== "SUB_ADMIN" && session.user.role !== "ADMIN")) {
    redirect("/login");
  }

  const submissionId = String(formData.get("submissionId") ?? "");
  const reason = String(formData.get("reason") ?? "Escalated by sub-admin").trim();
  if (!submissionId) redirect("/dashboard/sub-admin");

  const submission = await prisma.questionnaireSubmission.findUnique({
    where: { id: submissionId },
    include: {
      student: {
        include: { studentProfile: { select: { id: true } } },
      },
    },
  });
  if (!submission || !submission.student.studentProfile) redirect("/dashboard/sub-admin");

  if (session.user.role === "SUB_ADMIN" && submission.assignedToId && submission.assignedToId !== session.user.id) {
    redirect("/dashboard/sub-admin");
  }

  const taskTitle = `Escalation: ${submission.student.name ?? submission.student.email}`;
  await prisma.task.create({
    data: {
      title: taskTitle,
      description: reason,
      priority: "URGENT",
      status: "TODO",
      dueDate: new Date(Date.now() + 1000 * 60 * 60 * 24),
      studentProfileId: submission.student.studentProfile.id,
      assigneeId: submission.assignedToId ?? session.user.id,
      assignerId: session.user.id,
    },
  });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: submission.student.studentProfile.id,
      entityType: "TASK",
      entityId: submission.id,
      action: `Escalated case from sub-admin dashboard: ${reason}`,
    },
  });

  revalidateContributionsCache(submission.studentId);
  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/internal-staff");
  revalidatePath(`/dashboard/students/${submission.studentId}`);
  redirect("/dashboard/sub-admin");
}

async function createManualStudentAction(formData: FormData) {
  "use server";

  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "SUB_ADMIN") redirect("/dashboard/sub-admin?tab=students");

  const intake = parseManualClientIntakeFormData(formData);
  if (!intake) {
    redirect("/dashboard/sub-admin?tab=students&manualError=validation");
  }

  const actor = await prisma.user.findFirst({
    where: {
      role: "SUB_ADMIN",
      OR: [{ id: session.user.id }, ...(session.user.email ? [{ email: session.user.email }] : [])],
    },
    select: { id: true, email: true, name: true },
  });

  if (!actor) redirect("/login");

  const [existingUser, template] = await Promise.all([
    prisma.user.findUnique({
      where: { email: intake.email },
      select: {
        id: true,
        role: true,
        email: true,
        name: true,
        studentProfile: { select: { id: true } },
      },
    }),
    prisma.questionnaireTemplate.findFirst({
      where: { isActive: true },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    }),
  ]);

  if (existingUser && (existingUser.role !== "USER" || !existingUser.studentProfile)) {
    redirect("/dashboard/sub-admin?tab=students&manualError=duplicate");
  }
  if (!template) redirect("/dashboard/sub-admin?tab=students&manualError=template");

  const answers = buildManualIntakeAnswers(intake, { source: "Agent" });

  const created = await prisma.$transaction(async (tx) => {
    if (existingUser?.studentProfile) {
      await tx.user.update({
        where: { id: existingUser.id },
        data: { name: intake.name },
      });

      const newCase = await startNewVisaCaseForProfile(tx, {
        studentProfileId: existingUser.studentProfile.id,
        visaServiceType: intake.visaServiceType,
        otherServiceDescription: intake.otherServiceDescription,
        notes: intake.notes || "Started from agent intake for existing client",
      });

      const submission = await tx.questionnaireSubmission.create({
        data: {
          studentId: existingUser.id,
          templateId: template.id,
          assignedToId: actor.id,
          sourceCity: intake.city,
          sourceCountry: intake.country,
          intendedCourse: intake.isStudentVisa ? intake.course : null,
          intendedIntake: intake.isStudentVisa ? intake.intake : null,
          answers,
        },
        select: { id: true },
      });

      await tx.activityLog.create({
        data: {
          actorId: actor.id,
          targetUserId: existingUser.id,
          targetStudentProfileId: existingUser.studentProfile.id,
          entityType: "STUDENT",
          entityId: existingUser.id,
          action: `Started new case ${newCase.caseReference} through agent intake`,
          metadata: {
            visaServiceType: intake.visaServiceType,
            source: "sub_admin_repeat",
            submissionId: submission.id,
            assignedToId: actor.id,
            caseReference: newCase.caseReference,
          },
        },
      });

      return {
        studentUserId: existingUser.id,
        studentProfileId: existingUser.studentProfile.id,
        submissionId: submission.id,
        studentEmail: existingUser.email,
        studentName: intake.name || existingUser.name || existingUser.email,
      };
    }

    const studentUser = await tx.user.create({
      data: {
        name: intake.name,
        email: intake.email,
        role: "USER",
      },
      select: { id: true, email: true, name: true },
    });

    const studentProfile = await runWithUniqueCaseReference(tx, (caseReference) =>
      tx.studentProfile.create({
        data: {
          caseReference,
          userId: studentUser.id,
          ...buildManualIntakeProfileData(intake),
        },
        select: { id: true },
      }),
    );

    const submission = await tx.questionnaireSubmission.create({
      data: {
        studentId: studentUser.id,
        templateId: template.id,
        assignedToId: actor.id,
        sourceCity: intake.city,
        sourceCountry: intake.country,
        intendedCourse: intake.isStudentVisa ? intake.course : null,
        intendedIntake: intake.isStudentVisa ? intake.intake : null,
        answers,
      },
      select: { id: true },
    });

    await tx.activityLog.create({
      data: {
        actorId: actor.id,
        targetUserId: studentUser.id,
        targetStudentProfileId: studentProfile.id,
        entityType: "STUDENT",
        entityId: studentUser.id,
        action: "Created client through agent intake",
        metadata: {
          visaServiceType: intake.visaServiceType,
          source: "sub_admin",
          submissionId: submission.id,
          assignedToId: actor.id,
        },
      },
    });

    return {
      studentUserId: studentUser.id,
      studentProfileId: studentProfile.id,
      submissionId: submission.id,
      studentEmail: studentUser.email,
      studentName: studentUser.name ?? studentUser.email,
    };
  });

  const creatorLabel = actor.name ?? actor.email ?? "Agent";
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", deletedAt: null },
    select: { id: true, email: true },
  });

  await Promise.all(
    admins.map((recipient) =>
      createWorkflowNotification({
        recipientId: recipient.id,
        actorId: actor.id,
        studentProfileId: created.studentProfileId,
        type: "NEW_STUDENT_APPLICATION",
        title: "Client added by agent",
        message: `${created.studentName} (${intake.visaServiceLabel}) was added by ${creatorLabel}.`,
        note: intake.notes || null,
        link: `/dashboard/sub-admin?tab=students#submission-${created.submissionId}`,
        actionRequired: false,
        sendEmail: false,
        metadata: {
          visaServiceType: intake.visaServiceType,
          source: "sub_admin",
          submissionId: created.submissionId,
          subAdminId: actor.id,
        },
      }),
    ),
  );

  await Promise.all([
    queueDevEmail({
      createdById: actor.id,
      toEmail: created.studentEmail,
      subject: "Your client profile has been created - L&B Global",
      htmlBody: `
        <p>Dear ${escapeHtml(created.studentName)},</p>
        <p>Your client profile has been created by ${escapeHtml(creatorLabel)} at L&amp;B Global.</p>
        <p>Our team will contact you with the next steps for your ${escapeHtml(intake.visaServiceLabel)} enquiry.</p>
        <p>Best regards,<br />L&amp;B Global</p>
      `,
      templateKey: "sub-admin-student-created",
    }),
    ...admins.map((recipient) =>
      queueDevEmail({
        createdById: actor.id,
        toEmail: recipient.email,
        subject: `Client added by agent: ${created.studentName}`,
        htmlBody: `
          <p>${escapeHtml(creatorLabel)} added a new client through agent intake.</p>
          <ul>
            <li><strong>Name:</strong> ${escapeHtml(created.studentName)}</li>
            <li><strong>Email:</strong> ${escapeHtml(created.studentEmail)}</li>
            <li><strong>Service:</strong> ${escapeHtml(intake.visaServiceLabel)}</li>
            ${intake.isStudentVisa ? `<li><strong>Target course:</strong> ${escapeHtml(intake.course)}</li><li><strong>Preferred intake:</strong> ${escapeHtml(intake.intake)}</li>` : ""}
          </ul>
          <p>The case has been assigned to ${escapeHtml(creatorLabel)}.</p>
        `,
        templateKey: "sub-admin-student-created-notice",
      }),
    ),
  ]);

  revalidatePath("/dashboard/sub-admin");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/internal-staff");
  revalidatePath(`/dashboard/students/${created.studentUserId}`);
  redirect("/dashboard/sub-admin?tab=students&manualSuccess=client");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

