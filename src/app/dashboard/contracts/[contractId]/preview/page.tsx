import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DeleteWithConfirm } from "@/components/delete-with-confirm";
import { ContractBuilder, type ContractBuilderInitial } from "@/components/contract/contract-builder";
import { getCompanySettings } from "@/lib/company-settings";
import { prisma } from "@/lib/prisma";
import { staffCanAccessClientFinancials } from "@/lib/staff-client-access";
import { revalidatePath } from "next/cache";

type Params = Promise<{ contractId: string }>;

export default async function ContractPreviewPage(props: { params: Params }) {
  const { contractId } = await props.params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const [contract, companySettings] = await Promise.all([
    prisma.contract.findUnique({
      where: { id: contractId },
      include: {
        studentProfile: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
        createdBy: { select: { id: true, name: true, email: true } },
      },
    }),
    getCompanySettings(),
  ]);
  if (!contract) redirect("/dashboard");

  const canAccess = await staffCanAccessClientFinancials(
    session.user,
    contract.studentProfile.userId,
  );
  if (!canAccess) redirect("/dashboard");

  const studentName = contract.studentProfile.user.name ?? contract.studentProfile.user.email;
  const studentUserId = contract.studentProfile.userId;

  const initial: ContractBuilderInitial = {
    contractId: contract.id,
    contractNumber: contract.contractNumber ?? contract.id.slice(0, 8).toUpperCase(),
    status: contract.status as ContractBuilderInitial["status"],
    subject: contract.subject,
    recipientEmail: contract.recipientEmail,
    contractDate: contract.contractDate ?? formatDateNice(new Date()),
    applicantTitle: contract.applicantTitle ?? "",
    applicantName: contract.applicantName ?? studentName,
    applicantCid: contract.applicantCid ?? "",
    organizationName: contract.organizationName ?? companySettings.companyName,
    hasDependent: contract.hasDependent,
    dependentName: contract.dependentName ?? "",
    witnessName: contract.witnessName ?? "",
    witnessCid: contract.witnessCid ?? "",
    witnessContact: contract.witnessContact ?? "",
    companyLogoUrl: companySettings.logoUrl,
    studentReturnUrl: `/dashboard/students/${studentUserId}?tab=financials`,
  };

  return (
    <section className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "My Dashboard", href: "/dashboard" },
          { label: studentName, href: `/dashboard/students/${studentUserId}?tab=financials` },
          { label: "Contract Builder" },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Contract Builder</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            {studentName} · {initial.contractNumber}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${contractStatusTone(contract.status)}`}>
            {contract.status}
          </span>
          <Link
            href={`/dashboard/students/${studentUserId}?tab=financials`}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Back to client
          </Link>
          <DeleteWithConfirm
            formAction={deleteContractAction}
            confirmMessage={`Delete contract "${contract.contractNumber ?? contract.id}"? This cannot be undone.`}
            buttonLabel="Delete"
            buttonClassName="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <input type="hidden" name="contractId" value={contract.id} />
            <input type="hidden" name="studentId" value={studentUserId} />
          </DeleteWithConfirm>
        </div>
      </div>

      <ContractBuilder initial={initial} />
    </section>
  );
}

function contractStatusTone(status: string) {
  if (status === "SENT") return "bg-blue-50 text-blue-700";
  if (status === "ACCEPTED") return "bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "bg-rose-50 text-rose-700";
  if (status === "CANCELLED") return "bg-gray-200 text-gray-700";
  return "bg-gray-100 text-gray-700";
}

function formatDateNice(date: Date): string {
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
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
  if (!contractId) redirect("/dashboard");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { studentProfile: { select: { userId: true } } },
  });
  if (!contract) redirect("/dashboard");

  const canAccess = await staffCanAccessClientFinancials(
    session.user,
    contract.studentProfile.userId,
  );
  if (!canAccess) redirect("/dashboard");

  await prisma.outboundEmailLog.deleteMany({ where: { relatedContractId: contract.id } });
  await prisma.contract.delete({ where: { id: contract.id } });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: contract.studentProfileId,
      entityType: "CONTRACT",
      entityId: contract.id,
      action: "Deleted contract",
    },
  });

  const returnId = studentId || contract.studentProfile.userId;
  revalidatePath(`/dashboard/students/${returnId}`);
  redirect(`/dashboard/students/${returnId}?tab=financials`);
}
