"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxable: boolean;
};

export type InvoiceBuilderInitial = {
  invoiceId: string;
  invoiceNumber: string;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  subject: string;
  currency: string;
  dueDate: string | null;
  invoiceDateLabel: string;
  dueDateLabel: string;
  paymentTerms: string | null;
  remarks: string | null;
  customerLabel: string;
  discountAmount: number;
  taxRate: number;
  taxLabel: string;
  shippingAmount: number;
  companyName: string;
  legalName: string | null;
  abn: string | null;
  companyAddress: string | null;
  companyContact: string | null;
  companyLogoUrl: string | null;
  bankDetails: string | null;
  invoiceFooter: string | null;
  billTo: {
    name: string;
    company: string;
    address: string;
    phone: string;
    email: string;
  };
  shipTo: {
    name: string;
    company: string;
    address: string;
    phone: string;
    email: string;
  };
  lineItems: LineItem[];
  studentReturnUrl: string;
};

export function InvoiceBuilder({ initial }: { initial: InvoiceBuilderInitial }) {
  const router = useRouter();
  const previewRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "preparing" | "ready" | "error">("idle");

  const [subject, setSubject] = useState(initial.subject);
  const [currency, setCurrency] = useState(initial.currency.toUpperCase());
  const [paymentTerms, setPaymentTerms] = useState(initial.paymentTerms ?? "");
  const [dueDate, setDueDate] = useState(initial.dueDate ?? "");
  const [remarks, setRemarks] = useState(initial.remarks ?? "");
  const [customerLabel, setCustomerLabel] = useState(initial.customerLabel);
  const [discountAmount, setDiscountAmount] = useState<number>(initial.discountAmount);
  const [taxRate, setTaxRate] = useState<number>(initial.taxRate);
  const [shippingAmount, setShippingAmount] = useState<number>(initial.shippingAmount);

  const [companyName, setCompanyName] = useState(initial.companyName);
  const [legalName, setLegalName] = useState(initial.legalName ?? "");
  const [abn, setAbn] = useState(initial.abn ?? "");
  const [companyAddress, setCompanyAddress] = useState(initial.companyAddress ?? "");
  const [companyContact, setCompanyContact] = useState(initial.companyContact ?? "");
  const [bankDetails, setBankDetails] = useState(initial.bankDetails ?? "");

  const [billTo, setBillTo] = useState(initial.billTo);

  const [lineItems, setLineItems] = useState<LineItem[]>(
    initial.lineItems.length > 0
      ? initial.lineItems
      : [{ description: "", quantity: 1, unitPrice: 0, taxable: true }],
  );

  const totals = useMemo(() => calculateTotals(lineItems, discountAmount, taxRate, shippingAmount), [
    lineItems,
    discountAmount,
    taxRate,
    shippingAmount,
  ]);

  const formattedCurrency = currency || initial.currency || "AUD";
  const dueDateLabel = dueDate ? formatDateNice(dueDate) : initial.dueDateLabel || "";

  function updateLineItem(index: number, patch: Partial<LineItem>) {
    setLineItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }
  function addLineItem() {
    setLineItems((items) => [...items, { description: "", quantity: 1, unitPrice: 0, taxable: true }]);
  }
  function removeLineItem(index: number) {
    setLineItems((items) => (items.length <= 1 ? items : items.filter((_, i) => i !== index)));
  }

  async function generatePdfBlob(): Promise<Blob> {
    const node = previewRef.current;
    if (!node) throw new Error("Preview not ready");
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas-pro"),
      import("jspdf"),
    ]);
    const canvas = await html2canvas(node, {
      scale: 1.5,
      backgroundColor: "#ffffff",
      useCORS: true,
      logging: false,
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.92);
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const overflowTolerance = pageHeight * 0.05;
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
    heightLeft -= pageHeight;
    while (heightLeft > overflowTolerance) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight, undefined, "FAST");
      heightLeft -= pageHeight;
    }
    return pdf.output("blob");
  }

  async function downloadPdf() {
    try {
      setDownloadStatus("preparing");
      const blob = await generatePdfBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${initial.invoiceNumber || "invoice"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloadStatus("ready");
    } catch (error) {
      console.error(error);
      setDownloadStatus("error");
    }
  }

  function buildPayload() {
    return {
      invoiceId: initial.invoiceId,
      subject,
      currency: formattedCurrency,
      dueDate: dueDate || null,
      paymentTerms: paymentTerms || null,
      remarks: remarks || null,
      customerLabel: customerLabel || null,
      discountAmount,
      taxRate,
      shippingAmount,
      companyName,
      legalName: legalName || null,
      abn: abn || null,
      companyAddress: companyAddress || null,
      companyContact: companyContact || null,
      bankDetails: bankDetails || null,
      billTo: {
        name: billTo.name || null,
        company: billTo.company || null,
        address: billTo.address || null,
        phone: billTo.phone || null,
        email: billTo.email || null,
      },
      shipTo: null,
      lineItems: lineItems.map((item) => ({
        description: item.description.trim() || "Service",
        quantity: Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0,
        unitPrice: Number.isFinite(item.unitPrice) ? Math.max(0, item.unitPrice) : 0,
        taxable: !!item.taxable,
      })),
      previewHtml: previewRef.current?.outerHTML ?? "",
    };
  }

  async function saveDraft() {
    setSaveStatus("saving");
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/invoices/${initial.invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        throw new Error(text || `Save failed (${response.status})`);
      }
      setSaveStatus("saved");
      startTransition(() => router.refresh());
    } catch (error) {
      setSaveStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Save failed.");
    }
  }

  async function sendInvoice() {
    setSendStatus("sending");
    setErrorMessage(null);
    try {
      const saveRes = await fetch(`/api/invoices/${initial.invoiceId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!saveRes.ok) {
        const text = await saveRes.text().catch(() => "");
        throw new Error(text || `Save failed (${saveRes.status})`);
      }

      const pdfBlob = await generatePdfBlob();
      const pdfBase64 = await blobToBase64(pdfBlob);

      const sendRes = await fetch(`/api/invoices/${initial.invoiceId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pdfBase64,
          pdfFilename: `${initial.invoiceNumber || "invoice"}.pdf`,
        }),
      });
      if (!sendRes.ok) {
        const text = await sendRes.text().catch(() => "");
        throw new Error(text || `Send failed (${sendRes.status})`);
      }
      setSendStatus("sent");
      startTransition(() => router.refresh());
    } catch (error) {
      setSendStatus("error");
      setErrorMessage(error instanceof Error ? error.message : "Send failed.");
    }
  }

  const isReadOnly = initial.status !== "DRAFT";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
      {/* ── Left: form ─────────────────────────────────────────── */}
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Invoice Details</h2>
            <p className="text-xs text-slate-500">Status: {initial.status}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadPdf}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              {downloadStatus === "preparing" ? "Preparing PDF..." : "Download PDF"}
            </button>
            {!isReadOnly ? (
              <button
                type="button"
                onClick={saveDraft}
                disabled={saveStatus === "saving" || isPending}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {saveStatus === "saving" ? "Saving..." : saveStatus === "saved" ? "Saved" : "Save Draft"}
              </button>
            ) : null}
            {!isReadOnly ? (
              <button
                type="button"
                onClick={sendInvoice}
                disabled={sendStatus === "sending" || isPending}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {sendStatus === "sending" ? "Sending..." : "Send with PDF"}
              </button>
            ) : null}
          </div>
        </div>
        {errorMessage ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {errorMessage}
          </div>
        ) : null}

        <Field label="Email subject">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={isReadOnly} className={inputCls} />
        </Field>

        <Field label="Customer label (top of invoice)">
          <input
            value={customerLabel}
            onChange={(e) => setCustomerLabel(e.target.value)}
            placeholder="Kyangzom Reapplication"
            disabled={isReadOnly}
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Currency">
            <input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={6} disabled={isReadOnly} className={inputCls} />
          </Field>
          <Field label="Due date">
            <input type="date" value={dueDate ?? ""} onChange={(e) => setDueDate(e.target.value)} disabled={isReadOnly} className={inputCls} />
          </Field>
          <Field label="Terms">
            <input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="Due on receipt" disabled={isReadOnly} className={inputCls} />
          </Field>
        </div>

        <details className="rounded-lg border border-slate-200 p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
            Company block (override)
          </summary>
          <div className="mt-3 space-y-3">
            <Field label="Trading name">
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={isReadOnly} className={inputCls} />
            </Field>
            <Field label="Legal name (Payment Advice header)">
              <input value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={isReadOnly} className={inputCls} />
            </Field>
            <Field label="ABN">
              <input value={abn} onChange={(e) => setAbn(e.target.value)} disabled={isReadOnly} className={inputCls} />
            </Field>
            <Field label="Address">
              <textarea value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} rows={2} disabled={isReadOnly} className={inputCls} />
            </Field>
            <Field label="Contact">
              <textarea value={companyContact} onChange={(e) => setCompanyContact(e.target.value)} rows={2} disabled={isReadOnly} className={inputCls} />
            </Field>
            <Field label="Bank details (shown twice)">
              <textarea value={bankDetails} onChange={(e) => setBankDetails(e.target.value)} rows={4} disabled={isReadOnly} className={inputCls} />
            </Field>
          </div>
        </details>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Bill to (student)</legend>
          <div className="space-y-2">
            <input value={billTo.name} onChange={(e) => setBillTo({ ...billTo, name: e.target.value })} placeholder="Name" disabled={isReadOnly} className={inputCls} />
            <input value={billTo.email} onChange={(e) => setBillTo({ ...billTo, email: e.target.value })} placeholder="Email" disabled={isReadOnly} className={inputCls} />
            <input value={billTo.phone} onChange={(e) => setBillTo({ ...billTo, phone: e.target.value })} placeholder="Phone" disabled={isReadOnly} className={inputCls} />
            <textarea value={billTo.address} onChange={(e) => setBillTo({ ...billTo, address: e.target.value })} placeholder="Address" rows={2} disabled={isReadOnly} className={inputCls} />
          </div>
        </fieldset>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Line items</legend>
          <div className="space-y-3">
            {lineItems.map((item, index) => (
              <div key={index} className="rounded-md border border-slate-200 p-2">
                <textarea
                  value={item.description}
                  onChange={(e) => updateLineItem(index, { description: e.target.value })}
                  placeholder="Description"
                  rows={2}
                  disabled={isReadOnly}
                  className={inputCls}
                />
                <div className="mt-2 grid grid-cols-12 gap-2">
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateLineItem(index, { quantity: Number(e.target.value) })}
                    placeholder="Qty"
                    disabled={isReadOnly}
                    className={`${inputCls} col-span-3`}
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.unitPrice}
                    onChange={(e) => updateLineItem(index, { unitPrice: Number(e.target.value) })}
                    placeholder="Unit price"
                    disabled={isReadOnly}
                    className={`${inputCls} col-span-4`}
                  />
                  <label className="col-span-4 mt-2 flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={item.taxable}
                      onChange={(e) => updateLineItem(index, { taxable: e.target.checked })}
                      disabled={isReadOnly}
                    />
                    {initial.taxLabel} ({taxRate}%)
                  </label>
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    disabled={isReadOnly || lineItems.length <= 1}
                    className="col-span-1 rounded-md border border-slate-200 text-xs text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                    aria-label="Remove line item"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
            {!isReadOnly ? (
              <button
                type="button"
                onClick={addLineItem}
                className="rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                + Add line item
              </button>
            ) : null}
          </div>
        </fieldset>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Discount">
            <input type="number" min={0} step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} disabled={isReadOnly} className={inputCls} />
          </Field>
          <Field label={`${initial.taxLabel} rate (%)`}>
            <input type="number" min={0} step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} disabled={isReadOnly} className={inputCls} />
          </Field>
          <Field label="Shipping / handling">
            <input type="number" min={0} step="0.01" value={shippingAmount} onChange={(e) => setShippingAmount(Number(e.target.value))} disabled={isReadOnly} className={inputCls} />
          </Field>
        </div>

        <Field label="Remittance instructions">
          <textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} rows={4} disabled={isReadOnly} className={inputCls} />
        </Field>
      </div>

      {/* ── Right: live preview (this is what becomes the PDF) ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 p-4">
        <div className="mx-auto" style={{ maxWidth: 794 }}>
          <div
            ref={previewRef}
            className="bg-white text-slate-900 shadow-lg"
            style={{ width: 794, minHeight: 1123, padding: 48, fontFamily: "Helvetica, Arial, sans-serif" }}
          >
            {/* ── PAYMENT ADVICE strip ─────────────────────────── */}
            <section>
              <div className="flex items-start justify-between gap-6 border-b border-slate-300 pb-4">
                <div className="flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-700">Payment Advice</p>
                  {initial.companyLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={initial.companyLogoUrl}
                      alt={companyName}
                      style={{ maxHeight: 64, marginTop: 12, display: "block" }}
                      crossOrigin="anonymous"
                    />
                  ) : null}
                  <div className="mt-3 text-[11px] leading-snug text-slate-700">
                    <p className="font-semibold">To: {legalName || companyName}</p>
                    {companyAddress ? <p className="mt-1 whitespace-pre-line">{companyAddress}</p> : null}
                    {bankDetails ? <p className="mt-2 whitespace-pre-line">{bankDetails}</p> : null}
                  </div>
                </div>
                <div className="w-[280px]">
                  <table className="w-full border-collapse text-[11px]">
                    <tbody>
                      <AdviceRow label="Customer" value={customerLabel} />
                      <AdviceRow label="Invoice Number" value={initial.invoiceNumber} />
                      <AdviceRow label="Amount Due" value={formatMoney(formattedCurrency, totals.balanceDue, true)} />
                      <AdviceRow label="Due Date" value={dueDateLabel || "—"} />
                      <AdviceRow label="Amount Enclosed" value="" emphasised />
                    </tbody>
                  </table>
                  <p className="mt-1 text-right text-[9px] italic text-slate-500">
                    Enter the amount you are paying above
                  </p>
                </div>
              </div>
            </section>

            {/* ── TAX INVOICE header ───────────────────────────── */}
            <section className="mt-8">
              <div className="flex items-start justify-between gap-6">
                <div className="flex-1">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Tax Invoice</p>
                  <h1 className="mt-2 text-2xl font-bold text-slate-900">{customerLabel || "—"}</h1>
                  {billTo.address || billTo.email || billTo.phone ? (
                    <div className="mt-3 text-[11px] leading-snug text-slate-700">
                      {billTo.address ? <p className="whitespace-pre-line">{billTo.address}</p> : null}
                      {billTo.email ? <p>{billTo.email}</p> : null}
                      {billTo.phone ? <p>{billTo.phone}</p> : null}
                    </div>
                  ) : null}
                </div>
                <div className="w-[280px] text-[11px] text-slate-700">
                  <DetailRow label="Invoice Date" value={initial.invoiceDateLabel} />
                  <DetailRow label="Invoice Number" value={initial.invoiceNumber} />
                  {abn ? <DetailRow label="ABN" value={abn} /> : null}
                  <div className="mt-3 border-t border-slate-200 pt-2">
                    <p className="font-semibold text-slate-900">{companyName}</p>
                    {companyAddress ? <p className="mt-1 whitespace-pre-line">{companyAddress}</p> : null}
                  </div>
                  {bankDetails ? (
                    <p className="mt-2 whitespace-pre-line">{bankDetails}</p>
                  ) : null}
                </div>
              </div>
            </section>

            {/* ── Items table ──────────────────────────────────── */}
            <section className="mt-6">
              <table className="w-full border-collapse text-[11px]">
                <thead>
                  <tr className="border-b-2 border-slate-700 text-slate-700">
                    <th className="py-2 pr-2 text-left text-[10px] font-semibold uppercase tracking-wide">Description</th>
                    <th className="w-16 py-2 px-2 text-right text-[10px] font-semibold uppercase tracking-wide">Quantity</th>
                    <th className="w-24 py-2 px-2 text-right text-[10px] font-semibold uppercase tracking-wide">Unit Price</th>
                    <th className="w-20 py-2 px-2 text-right text-[10px] font-semibold uppercase tracking-wide">{initial.taxLabel}</th>
                    <th className="w-28 py-2 pl-2 text-right text-[10px] font-semibold uppercase tracking-wide">
                      Amount {formattedCurrency}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => (
                    <tr key={index} className="border-b border-slate-200 align-top">
                      <td className="py-2 pr-2 whitespace-pre-line">{item.description || "—"}</td>
                      <td className="py-2 px-2 text-right">{formatNumber(item.quantity)}</td>
                      <td className="py-2 px-2 text-right">{formatMoney(formattedCurrency, item.unitPrice)}</td>
                      <td className="py-2 px-2 text-right">{item.taxable ? `${taxRate}%` : `No ${initial.taxLabel}`}</td>
                      <td className="py-2 pl-2 text-right">{formatMoney(formattedCurrency, round2(item.quantity * item.unitPrice))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {/* ── Totals (right-aligned) ───────────────────────── */}
            <section className="mt-4 flex justify-end">
              <div className="w-[280px] space-y-1 text-[11px]">
                <TotalRow label="Subtotal" value={formatMoney(formattedCurrency, totals.subtotal)} />
                {discountAmount > 0 ? (
                  <TotalRow label="Discount" value={`- ${formatMoney(formattedCurrency, totals.discount)}`} />
                ) : null}
                {totals.taxAmount > 0 ? (
                  <TotalRow label={`TOTAL ${initial.taxLabel} ${taxRate}%`} value={formatMoney(formattedCurrency, totals.taxAmount)} />
                ) : null}
                {shippingAmount > 0 ? (
                  <TotalRow label="Shipping" value={formatMoney(formattedCurrency, totals.shipping)} />
                ) : null}
                <div className="mt-1 flex items-center justify-between border-t-2 border-slate-700 pt-2">
                  <span className="text-[12px] font-bold uppercase">Total {formattedCurrency}</span>
                  <span className="text-[14px] font-bold">{formatMoney(formattedCurrency, totals.balanceDue, true)}</span>
                </div>
              </div>
            </section>

            {/* ── Due date + remittance ────────────────────────── */}
            <section className="mt-8 text-[11px] leading-relaxed text-slate-700">
              {dueDateLabel ? (
                <p className="font-semibold text-slate-900">Due Date: {dueDateLabel}</p>
              ) : null}
              {remarks ? <p className="mt-2 whitespace-pre-line">{remarks}</p> : null}
            </section>

            {/* ── Footer ───────────────────────────────────────── */}
            <div className="mt-12 text-center text-[10px] text-slate-500">
              {initial.invoiceFooter || "-- 1 of 1 --"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-slate-500 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-slate-700">
      {label}
      {children}
    </label>
  );
}

function AdviceRow({ label, value, emphasised }: { label: string; value: string; emphasised?: boolean }) {
  return (
    <tr className="border-b border-slate-200">
      <td className="py-1.5 pr-2 text-[10px] font-semibold uppercase tracking-wide text-slate-600">{label}</td>
      <td className={`py-1.5 text-right ${emphasised ? "min-h-[14px]" : ""}`}>{value}</td>
    </tr>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-right text-slate-800">{value}</span>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

function calculateTotals(items: LineItem[], discount: number, taxRate: number, shipping: number) {
  const subtotal = round2(items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0));
  const taxableSubtotal = round2(
    items.reduce((sum, item) => (item.taxable ? sum + (item.quantity || 0) * (item.unitPrice || 0) : sum), 0),
  );
  const discountAmount = round2(Math.max(0, discount || 0));
  const subtotalAfterDiscount = round2(Math.max(0, subtotal - discountAmount));
  const taxPercent = Math.max(0, taxRate || 0);
  const taxAmount = round2(taxableSubtotal * (taxPercent / 100));
  const shippingAmount = round2(Math.max(0, shipping || 0));
  const balanceDue = round2(subtotalAfterDiscount + taxAmount + shippingAmount);
  return {
    subtotal,
    discount: discountAmount,
    subtotalAfterDiscount,
    taxAmount,
    shipping: shippingAmount,
    balanceDue,
  };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoney(currency: string, amount: number, withCurrencyLabel = false) {
  const fixed = (Math.round(amount * 100) / 100).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (withCurrencyLabel) return fixed;
  return fixed;
  // currency label is displayed in the table header / total row label instead,
  // matching the Xero/L&B style.
  void currency;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateNice(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  const day = d.getUTCDate();
  const monthIndex = d.getUTCMonth();
  const year = d.getUTCFullYear();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${months[monthIndex]} ${year}`;
}

async function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? "");
      const base64 = result.includes(",") ? result.split(",", 2)[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read PDF"));
    reader.readAsDataURL(blob);
  });
}
