import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { DeleteWithConfirm } from "@/components/delete-with-confirm";
import { InvoiceBuilder, type InvoiceBuilderInitial } from "@/components/invoice/invoice-builder";
import { getCompanySettings } from "@/lib/company-settings";
import { prisma } from "@/lib/prisma";
import { staffCanAccessClientFinancials } from "@/lib/staff-client-access";

type Params = Promise<{ invoiceId: string }>;

export default async function InvoiceBuilderPage(props: { params: Params }) {
  const { invoiceId } = await props.params;
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    redirect("/dashboard");
  }

  const [invoice, settings] = await Promise.all([
    prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: {
        lineItems: { orderBy: { createdAt: "asc" } },
        studentProfile: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    }),
    getCompanySettings(),
  ]);
  if (!invoice) redirect("/dashboard");

  const canAccess = await staffCanAccessClientFinancials(session.user, invoice.studentProfile.user.id);
  if (!canAccess) redirect("/dashboard");

  const student = invoice.studentProfile.user;
  const profile = invoice.studentProfile;
  const studentReturnUrl = `/dashboard/students/${student.id}?tab=financials`;

  const invoiceDateLabel = formatInvoiceDate(invoice.createdAt);
  const dueDateLabel = invoice.dueDate ? formatInvoiceDate(invoice.dueDate) : "";

  const taxRate = invoice.taxRate || settings.defaultTaxRate;
  const customerLabel = invoice.title?.startsWith("Invoice - ")
    ? invoice.title.slice("Invoice - ".length)
    : invoice.title || (student.name ?? student.email);

  const initial: InvoiceBuilderInitial = {
    invoiceId: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    status: invoice.status,
    subject: invoice.subject,
    currency: invoice.currency,
    dueDate: invoice.dueDate ? invoice.dueDate.toISOString().slice(0, 10) : null,
    invoiceDateLabel,
    dueDateLabel,
    paymentTerms: invoice.paymentTerms ?? settings.paymentTerms,
    remarks: invoice.remarks ?? settings.paymentRemarks,
    customerLabel,
    discountAmount: invoice.discountAmount,
    taxRate,
    taxLabel: settings.defaultTaxLabel,
    shippingAmount: invoice.shippingAmount,
    companyName: invoice.companyName ?? settings.companyName,
    legalName: settings.legalName,
    abn: settings.abn,
    companyAddress: invoice.companyAddress ?? settings.addressLine,
    companyContact: invoice.companyContact ?? settings.contactDetails,
    companyLogoUrl: invoice.companyLogoUrl ?? settings.logoUrl ?? "/loogo.png",
    bankDetails: settings.bankDetails,
    invoiceFooter: settings.invoiceFooter,
    billTo: {
      name: invoice.billToName ?? student.name ?? "",
      company: invoice.billToCompany ?? "",
      address: invoice.billToAddress ?? profile.currentAddress ?? "",
      phone: invoice.billToPhone ?? profile.phone ?? "",
      email: invoice.billToEmail ?? student.email ?? "",
    },
    shipTo: {
      name: invoice.shipToName ?? "",
      company: invoice.shipToCompany ?? "",
      address: invoice.shipToAddress ?? "",
      phone: invoice.shipToPhone ?? "",
      email: invoice.shipToEmail ?? "",
    },
    lineItems:
      invoice.lineItems.length > 0
        ? invoice.lineItems.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            taxable: item.taxable,
          }))
        : [{ description: "", quantity: 1, unitPrice: 0, taxable: true }],
    studentReturnUrl,
  };

  const displayName = student.name ?? student.email;

  return (
    <section className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "My Dashboard", href: "/dashboard" },
          { label: displayName, href: `/dashboard/students/${student.id}` },
          { label: `Invoice ${invoice.invoiceNumber}` },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Invoice Builder</h1>
          <p className="mt-1 text-sm text-slate-600">
            {invoice.invoiceNumber} · {displayName}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${invoiceStatusTone(invoice.status)}`}>
            {invoice.status}
          </span>
          <Link href={studentReturnUrl} className="rounded-md border px-3 py-2 text-sm text-slate-700 hover:bg-slate-50">
            Back to client
          </Link>
        </div>
      </div>

      <InvoiceBuilder initial={initial} />

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        {invoice.status === "SENT" ? (
          <form action={markInvoicePaidAction}>
            <input type="hidden" name="invoiceId" value={invoice.id} />
            <button
              type="submit"
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Mark as Paid
            </button>
          </form>
        ) : null}
        <DeleteWithConfirm
          formAction={deleteInvoiceAction}
          confirmMessage={`Delete invoice ${invoice.invoiceNumber}? This cannot be undone.`}
          buttonLabel="Delete Invoice"
          buttonClassName="rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700"
        >
          <input type="hidden" name="invoiceId" value={invoice.id} />
        </DeleteWithConfirm>
      </div>
    </section>
  );
}

function formatInvoiceDate(value: Date) {
  const day = value.getUTCDate();
  const monthIndex = value.getUTCMonth();
  const year = value.getUTCFullYear();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[monthIndex]} ${year}`;
}

function invoiceStatusTone(status: string) {
  if (status === "SENT") return "bg-blue-50 text-blue-700";
  if (status === "PAID") return "bg-emerald-50 text-emerald-700";
  if (status === "OVERDUE") return "bg-amber-50 text-amber-700";
  if (status === "CANCELLED") return "bg-gray-200 text-gray-700";
  return "bg-gray-100 text-gray-700";
}

async function markInvoicePaidAction(formData: FormData) {
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
  if (!invoiceId) redirect("/dashboard");

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { studentProfile: { select: { userId: true } } },
  });
  if (!invoice || invoice.status !== "SENT" || !invoice.studentProfile) redirect("/dashboard");

  const canAccess = await staffCanAccessClientFinancials(session.user, invoice.studentProfile.userId);
  if (!canAccess) redirect("/dashboard");

  const studentUserId = invoice.studentProfile.userId;

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: "PAID", paidAt: new Date() },
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: invoice.studentProfileId,
      entityType: "INVOICE",
      entityId: invoice.id,
      action: `Marked invoice ${invoice.invoiceNumber} as paid`,
      metadata: { invoiceNumber: invoice.invoiceNumber },
    },
  });

  revalidatePath(`/dashboard/invoices/${invoice.id}/preview`);
  revalidatePath(`/dashboard/students/${studentUserId}`);
  redirect(`/dashboard/students/${studentUserId}?tab=financials`);
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
  if (!invoiceId) redirect("/dashboard");

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { studentProfile: { select: { userId: true } } },
  });
  if (!invoice) redirect("/dashboard");

  const canAccess = await staffCanAccessClientFinancials(session.user, invoice.studentProfile.userId);
  if (!canAccess) redirect("/dashboard");

  await prisma.outboundEmailLog.deleteMany({ where: { relatedInvoiceId: invoice.id } });
  await prisma.invoice.delete({ where: { id: invoice.id } });
  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: invoice.studentProfileId,
      entityType: "INVOICE",
      entityId: invoice.id,
      action: "Deleted invoice from builder",
    },
  });

  revalidatePath(`/dashboard/students/${invoice.studentProfile.userId}`);
  redirect(`/dashboard/students/${invoice.studentProfile.userId}?tab=financials`);
}
