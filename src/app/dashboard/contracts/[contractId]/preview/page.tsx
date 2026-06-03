import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DeleteWithConfirm } from "@/components/delete-with-confirm";
import { queueDevEmail } from "@/lib/email-outbox";
import { prisma } from "@/lib/prisma";

type Params = Promise<{ contractId: string }>;
type SearchParams = Promise<{ emailError?: string }>;

export default async function ContractPreviewPage(props: {
  params: Params;
  searchParams: SearchParams;
}) {
  const { contractId } = await props.params;
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: {
      studentProfile: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
      template: true,
      createdBy: { select: { id: true, name: true, email: true } },
    },
  });
  if (!contract) redirect("/dashboard");

  const studentName = contract.studentProfile.user.name ?? contract.studentProfile.user.email;
  const studentUserId = contract.studentProfile.userId;

  return (
    <section className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "My Dashboard", href: "/dashboard" },
          { label: studentName, href: `/dashboard/students/${studentUserId}` },
          { label: "Contract" },
        ]}
      />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Contract Preview</h1>
          <p className="mt-1 text-sm text-gray-600">
            {studentName}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${contractStatusTone(contract.status)}`}>
          {contract.status}
        </span>
        <Link
          href={`/dashboard/students/${studentUserId}`}
          className="rounded-md border px-3 py-2 text-sm"
        >
          Back to client profile
        </Link>
      </div>

      {searchParams.emailError === "send-failed" ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          Contract email failed to send. Please check the email settings and try again.
        </div>
      ) : null}

      <section className="rounded-lg border bg-white p-4">
        <div className="mb-3 rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700">
          Edit contract details below, then save. Use Send Contract only after reviewing the live preview.
        </div>
        <form action={updateContractDraftAction} className="space-y-3">
          <input type="hidden" name="contractId" value={contract.id} />
          <label className="block text-sm">
            Email Subject
            <input
              name="subject"
              required
              defaultValue={contract.subject}
              className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            Contract Message (plain text)
            <textarea
              name="messageText"
              required
              defaultValue={htmlToPlainText(contract.htmlSnapshot)}
              className="mt-1 min-h-56 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            />
          </label>
          <p className="text-xs text-gray-500">
            Tip: short paragraphs make the final contract easier for clients to read.
          </p>
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium"
          >
            Save Changes
          </button>
        </form>
      </section>

      <section className="rounded-lg border bg-white p-4">
        <p className="text-sm font-semibold">Live Preview</p>
        <article
          className="prose mt-3 max-w-none rounded-md border border-gray-200 bg-white p-4"
          dangerouslySetInnerHTML={{ __html: contract.htmlSnapshot }}
        />
      </section>

      <div className="flex flex-wrap gap-3">
        <form action={sendContractAction}>
          <input type="hidden" name="contractId" value={contract.id} />
          <button
            type="submit"
            className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white"
          >
            Send Contract
          </button>
        </form>
        <DeleteWithConfirm
          formAction={deleteContractAction}
          confirmMessage={`Delete contract "${contract.title}"? This cannot be undone.`}
          buttonLabel="Delete Contract"
          buttonClassName="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700"
        >
          <input type="hidden" name="contractId" value={contract.id} />
        </DeleteWithConfirm>
      </div>
    </section>
  );
}

async function sendContractAction(formData: FormData) {
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
  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { studentProfile: true, template: true },
  });
  if (!contract) redirect("/dashboard");

  const sendResult = await queueDevEmail({
    createdById: session.user.id,
    toEmail: contract.recipientEmail,
    subject: contract.subject,
    htmlBody: contract.htmlSnapshot,
    templateKey: contract.template?.key,
    relatedContractId: contract.id,
  });

  if (sendResult.status !== "SENT") {
    redirect(`/dashboard/contracts/${contract.id}/preview?emailError=send-failed`);
  }

  await prisma.contract.update({
    where: { id: contract.id },
    data: {
      status: "SENT",
      sentAt: new Date(),
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: contract.studentProfileId,
      entityType: "CONTRACT",
      entityId: contract.id,
      action: "Sent contract email after preview approval",
    },
  });

  const student = await prisma.studentProfile.findUnique({
    where: { id: contract.studentProfileId },
    select: { userId: true },
  });
  if (!student) redirect("/dashboard");

  revalidatePath(`/dashboard/contracts/${contract.id}/preview`);
  revalidatePath(`/dashboard/students/${student.userId}`);
  redirect(`/dashboard/students/${student.userId}`);
}

async function updateContractDraftAction(formData: FormData) {
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
  const subject = String(formData.get("subject") ?? "").trim();
  const messageText = String(formData.get("messageText") ?? "").trim();
  if (!contractId || !subject || !messageText) {
    redirect(`/dashboard/contracts/${contractId}/preview`);
  }

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    select: { id: true, studentProfileId: true, status: true },
  });
  if (!contract) redirect("/dashboard");

  await prisma.contract.update({
    where: { id: contractId },
    data: {
      subject,
      htmlSnapshot: plainTextToHtml(messageText),
      status: contract.status === "SENT" ? "DRAFT" : contract.status,
      sentAt: contract.status === "SENT" ? null : undefined,
    },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: contract.studentProfileId,
      entityType: "CONTRACT",
      entityId: contractId,
      action: "Edited contract preview content",
    },
  });

  revalidatePath(`/dashboard/contracts/${contractId}/preview`);
  redirect(`/dashboard/contracts/${contractId}/preview`);
}

function htmlToPlainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>\s*<p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function plainTextToHtml(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${block.replace(/\n/g, "<br />")}</p>`);
  return paragraphs.join("");
}

function contractStatusTone(status: string) {
  if (status === "SENT") return "bg-blue-50 text-blue-700";
  if (status === "ACCEPTED") return "bg-emerald-50 text-emerald-700";
  if (status === "REJECTED") return "bg-rose-50 text-rose-700";
  if (status === "CANCELLED") return "bg-gray-200 text-gray-700";
  return "bg-gray-100 text-gray-700";
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
  if (!contractId) redirect("/dashboard");

  const contract = await prisma.contract.findUnique({
    where: { id: contractId },
    include: { studentProfile: { select: { userId: true } } },
  });
  if (!contract) redirect("/dashboard");

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
      action: "Deleted contract from preview page",
    },
  });

  revalidatePath(`/dashboard/students/${contract.studentProfile.userId}`);
  redirect(`/dashboard/students/${contract.studentProfile.userId}`);
}
