import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { getCompanySettings, updateCompanySettings } from "@/lib/company-settings";

type SearchParams = Promise<{ saved?: string }>;

export default async function CompanySettingsPage(props: { searchParams: SearchParams }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "ADMIN") redirect("/dashboard");

  const settings = await getCompanySettings();
  const searchParams = await props.searchParams;
  const saved = searchParams.saved === "1";

  return (
    <section className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Admin Dashboard", href: "/dashboard/admin" },
          { label: "Company / Invoice Settings" },
        ]}
      />
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Company &amp; Invoice Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          These details are used as defaults on every new invoice (sender block, logo, currency, payment instructions).
        </p>
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Settings saved.
        </div>
      ) : null}

      <form action={updateCompanySettingsAction} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Company name</span>
            <input
              name="companyName"
              required
              defaultValue={settings.companyName}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Default currency</span>
            <input
              name="defaultCurrency"
              required
              defaultValue={settings.defaultCurrency}
              maxLength={6}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Company address</span>
            <textarea
              name="addressLine"
              defaultValue={settings.addressLine ?? ""}
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="123 Education St, Sydney NSW 2000, Australia"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Contact details</span>
            <textarea
              name="contactDetails"
              defaultValue={settings.contactDetails ?? ""}
              rows={3}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="+61 0424 919 833\nstudent@lbglobal.com\nABN 12 345 678 910"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Logo URL (optional)</span>
            <input
              name="logoUrl"
              type="url"
              defaultValue={settings.logoUrl ?? ""}
              placeholder="https://your-blob-url/logo.png"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-slate-700">Invoice number prefix</span>
            <input
              name="invoicePrefix"
              defaultValue={settings.invoicePrefix}
              maxLength={12}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Default payment terms</span>
            <input
              name="paymentTerms"
              defaultValue={settings.paymentTerms ?? ""}
              placeholder="Due on receipt"
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="font-medium text-slate-700">Default remarks / payment instructions</span>
            <textarea
              name="paymentRemarks"
              defaultValue={settings.paymentRemarks ?? ""}
              rows={4}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              placeholder="Bank: ANZ\nBSB: 012-345\nAccount: 1234 5678"
            />
          </label>
        </div>
        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
          >
            Save settings
          </button>
        </div>
      </form>
    </section>
  );
}

async function updateCompanySettingsAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const companyName = String(formData.get("companyName") ?? "").trim() || "L&B Global";
  const defaultCurrency = String(formData.get("defaultCurrency") ?? "AUD").trim().toUpperCase() || "AUD";
  const invoicePrefix = String(formData.get("invoicePrefix") ?? "INV-").trim() || "INV-";

  const addressLine = stringOrNull(formData.get("addressLine"));
  const contactDetails = stringOrNull(formData.get("contactDetails"));
  const logoUrl = stringOrNull(formData.get("logoUrl"));
  const paymentTerms = stringOrNull(formData.get("paymentTerms"));
  const paymentRemarks = stringOrNull(formData.get("paymentRemarks"));

  await updateCompanySettings({
    companyName,
    defaultCurrency,
    invoicePrefix,
    addressLine,
    contactDetails,
    logoUrl,
    paymentTerms,
    paymentRemarks,
  });

  revalidatePath("/dashboard/admin/settings");
  redirect("/dashboard/admin/settings?saved=1");
}

function stringOrNull(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}
