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
          These details are used as defaults on every new invoice (header, ABN, bank block, footer instructions).
        </p>
      </div>

      {saved ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Settings saved.
        </div>
      ) : null}

      <form action={updateCompanySettingsAction} className="space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">Identity</legend>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Trading name">
              <input name="companyName" required defaultValue={settings.companyName} className={inputCls} />
            </Field>
            <Field label="Legal name (printed on Payment Advice)">
              <input
                name="legalName"
                defaultValue={settings.legalName ?? ""}
                placeholder="L&B Global Pty Ltd"
                className={inputCls}
              />
            </Field>
            <Field label="ABN">
              <input
                name="abn"
                defaultValue={settings.abn ?? ""}
                placeholder="47 649 045 714"
                className={inputCls}
              />
            </Field>
            <Field label="Logo URL">
              <input
                name="logoUrl"
                type="url"
                defaultValue={settings.logoUrl ?? ""}
                placeholder="https://your-blob-url/logo.png"
                className={inputCls}
              />
            </Field>
            <Field label="Company address" colSpan={2}>
              <textarea
                name="addressLine"
                defaultValue={settings.addressLine ?? ""}
                rows={3}
                className={inputCls}
                placeholder={`Unit 32 25 Walters Dr,\nOsborne Park, WA 6017`}
              />
            </Field>
            <Field label="Contact details (phone, email)" colSpan={2}>
              <textarea
                name="contactDetails"
                defaultValue={settings.contactDetails ?? ""}
                rows={2}
                className={inputCls}
                placeholder={`+61 0424 919 833\nstudent@lbglobal.com.au`}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">Invoice defaults</legend>
          <div className="grid gap-4 md:grid-cols-4">
            <Field label="Currency">
              <input
                name="defaultCurrency"
                required
                defaultValue={settings.defaultCurrency}
                maxLength={6}
                className={inputCls}
              />
            </Field>
            <Field label="Invoice prefix">
              <input
                name="invoicePrefix"
                defaultValue={settings.invoicePrefix}
                maxLength={12}
                className={inputCls}
              />
            </Field>
            <Field label="Tax label">
              <input
                name="defaultTaxLabel"
                defaultValue={settings.defaultTaxLabel}
                placeholder="GST"
                className={inputCls}
              />
            </Field>
            <Field label="Default tax rate (%)">
              <input
                name="defaultTaxRate"
                type="number"
                min={0}
                step="0.01"
                defaultValue={settings.defaultTaxRate}
                className={inputCls}
              />
            </Field>
            <Field label="Default payment terms" colSpan={4}>
              <input
                name="paymentTerms"
                defaultValue={settings.paymentTerms ?? ""}
                placeholder="Due on receipt"
                className={inputCls}
              />
            </Field>
          </div>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-semibold uppercase tracking-wide text-slate-500">Payment block</legend>
          <Field label="Bank details (shown twice on the invoice)">
            <textarea
              name="bankDetails"
              defaultValue={settings.bankDetails ?? ""}
              rows={5}
              className={inputCls}
              placeholder={`BSB: 066140\nAccount number: 10487947\nCTBAAU2S - Swift Code`}
            />
          </Field>
          <Field label="Remittance instructions (below items)">
            <textarea
              name="paymentRemarks"
              defaultValue={settings.paymentRemarks ?? ""}
              rows={4}
              className={inputCls}
              placeholder={`Please remit your payment to the following account before the due date:\nAccount name: LB Global\nBank Address: Common Wealth Bank of Australia, 217a Main St, Osborne Park WA 6017`}
            />
          </Field>
          <Field label="Footer (small text under footer)">
            <input
              name="invoiceFooter"
              defaultValue={settings.invoiceFooter ?? ""}
              placeholder="-- 1 of 1 --"
              className={inputCls}
            />
          </Field>
        </fieldset>

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

const inputCls =
  "mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-500 focus:outline-none";

function Field({
  label,
  children,
  colSpan,
}: {
  label: string;
  children: React.ReactNode;
  colSpan?: number;
}) {
  const span = colSpan === 4 ? "md:col-span-4" : colSpan === 2 ? "md:col-span-2" : "";
  return (
    <label className={`block text-sm ${span}`}>
      <span className="font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

async function updateCompanySettingsAction(formData: FormData) {
  "use server";
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/login");

  const companyName = String(formData.get("companyName") ?? "").trim() || "L&B Global";
  const defaultCurrency = String(formData.get("defaultCurrency") ?? "AUD").trim().toUpperCase() || "AUD";
  const invoicePrefix = String(formData.get("invoicePrefix") ?? "INV-").trim() || "INV-";
  const defaultTaxLabel = String(formData.get("defaultTaxLabel") ?? "GST").trim() || "GST";
  const defaultTaxRateRaw = Number(formData.get("defaultTaxRate") ?? 10);
  const defaultTaxRate = Number.isFinite(defaultTaxRateRaw) && defaultTaxRateRaw >= 0 ? defaultTaxRateRaw : 10;

  await updateCompanySettings({
    companyName,
    legalName: stringOrNull(formData.get("legalName")),
    abn: stringOrNull(formData.get("abn")),
    addressLine: stringOrNull(formData.get("addressLine")),
    contactDetails: stringOrNull(formData.get("contactDetails")),
    bankDetails: stringOrNull(formData.get("bankDetails")),
    logoUrl: stringOrNull(formData.get("logoUrl")),
    defaultCurrency,
    defaultTaxRate,
    defaultTaxLabel,
    paymentTerms: stringOrNull(formData.get("paymentTerms")),
    paymentRemarks: stringOrNull(formData.get("paymentRemarks")),
    invoicePrefix,
    invoiceFooter: stringOrNull(formData.get("invoiceFooter")),
  });

  revalidatePath("/dashboard/admin/settings");
  redirect("/dashboard/admin/settings?saved=1");
}

function stringOrNull(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}
