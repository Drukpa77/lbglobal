"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type LineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type InvoiceBuilderInitial = {
  invoiceId: string;
  invoiceNumber: string;
  status: "DRAFT" | "SENT" | "PAID" | "OVERDUE" | "CANCELLED";
  subject: string;
  currency: string;
  dueDate: string | null;
  paymentTerms: string | null;
  remarks: string | null;
  discountAmount: number;
  taxRate: number;
  shippingAmount: number;
  companyName: string;
  companyAddress: string | null;
  companyContact: string | null;
  companyLogoUrl: string | null;
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
  const [discountAmount, setDiscountAmount] = useState<number>(initial.discountAmount);
  const [taxRate, setTaxRate] = useState<number>(initial.taxRate);
  const [shippingAmount, setShippingAmount] = useState<number>(initial.shippingAmount);

  const [companyName, setCompanyName] = useState(initial.companyName);
  const [companyAddress, setCompanyAddress] = useState(initial.companyAddress ?? "");
  const [companyContact, setCompanyContact] = useState(initial.companyContact ?? "");

  const [billTo, setBillTo] = useState(initial.billTo);
  const [shipTo, setShipTo] = useState(initial.shipTo);

  const [lineItems, setLineItems] = useState<LineItem[]>(
    initial.lineItems.length > 0
      ? initial.lineItems
      : [{ description: "", quantity: 1, unitPrice: 0 }],
  );

  const totals = useMemo(() => calculateTotals(lineItems, discountAmount, taxRate, shippingAmount), [
    lineItems,
    discountAmount,
    taxRate,
    shippingAmount,
  ]);

  const formattedCurrency = currency || initial.currency || "AUD";
  const todayIso = useMemo(() => new Date().toLocaleDateString(), []);

  function updateLineItem(index: number, patch: Partial<LineItem>) {
    setLineItems((items) =>
      items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }
  function addLineItem() {
    setLineItems((items) => [...items, { description: "", quantity: 1, unitPrice: 0 }]);
  }
  function removeLineItem(index: number) {
    setLineItems((items) =>
      items.length <= 1 ? items : items.filter((_, i) => i !== index),
    );
  }

  async function generatePdfBlob(): Promise<Blob> {
    const node = previewRef.current;
    if (!node) throw new Error("Preview not ready");
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
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
      discountAmount,
      taxRate,
      shippingAmount,
      companyName,
      companyAddress: companyAddress || null,
      companyContact: companyContact || null,
      billTo: {
        name: billTo.name || null,
        company: billTo.company || null,
        address: billTo.address || null,
        phone: billTo.phone || null,
        email: billTo.email || null,
      },
      shipTo: {
        name: shipTo.name || null,
        company: shipTo.company || null,
        address: shipTo.address || null,
        phone: shipTo.phone || null,
        email: shipTo.email || null,
      },
      lineItems: lineItems.map((item) => ({
        description: item.description.trim() || "Service",
        quantity: Number.isFinite(item.quantity) ? Math.max(0, item.quantity) : 0,
        unitPrice: Number.isFinite(item.unitPrice) ? Math.max(0, item.unitPrice) : 0,
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
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            disabled={isReadOnly}
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Currency">
            <input
              value={currency}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              maxLength={6}
              disabled={isReadOnly}
              className={inputCls}
            />
          </Field>
          <Field label="Due date">
            <input
              type="date"
              value={dueDate ?? ""}
              onChange={(e) => setDueDate(e.target.value)}
              disabled={isReadOnly}
              className={inputCls}
            />
          </Field>
          <Field label="Payment terms">
            <input
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="Due on receipt"
              disabled={isReadOnly}
              className={inputCls}
            />
          </Field>
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Your company</legend>
          <div className="grid gap-3">
            <Field label="Company name">
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} disabled={isReadOnly} className={inputCls} />
            </Field>
            <Field label="Address">
              <textarea value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} rows={2} disabled={isReadOnly} className={inputCls} />
            </Field>
            <Field label="Contact details">
              <textarea value={companyContact} onChange={(e) => setCompanyContact(e.target.value)} rows={2} disabled={isReadOnly} className={inputCls} />
            </Field>
          </div>
        </fieldset>

        <div className="grid gap-4 md:grid-cols-2">
          <PartyFieldset
            title="Bill To"
            party={billTo}
            onChange={setBillTo}
            disabled={isReadOnly}
          />
          <PartyFieldset
            title="Ship To"
            party={shipTo}
            onChange={setShipTo}
            disabled={isReadOnly}
          />
        </div>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Line items</legend>
          <div className="space-y-2">
            {lineItems.map((item, index) => (
              <div key={index} className="grid grid-cols-12 gap-2">
                <input
                  value={item.description}
                  onChange={(e) => updateLineItem(index, { description: e.target.value })}
                  placeholder="Description"
                  disabled={isReadOnly}
                  className={`${inputCls} col-span-6`}
                />
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={item.quantity}
                  onChange={(e) => updateLineItem(index, { quantity: Number(e.target.value) })}
                  placeholder="Qty"
                  disabled={isReadOnly}
                  className={`${inputCls} col-span-2`}
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(e) => updateLineItem(index, { unitPrice: Number(e.target.value) })}
                  placeholder="Unit price"
                  disabled={isReadOnly}
                  className={`${inputCls} col-span-3`}
                />
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
            ))}
            {!isReadOnly ? (
              <button
                type="button"
                onClick={addLineItem}
                className="mt-1 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                + Add line item
              </button>
            ) : null}
          </div>
        </fieldset>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Discount">
            <input
              type="number"
              min={0}
              step="0.01"
              value={discountAmount}
              onChange={(e) => setDiscountAmount(Number(e.target.value))}
              disabled={isReadOnly}
              className={inputCls}
            />
          </Field>
          <Field label="Tax rate (%)">
            <input
              type="number"
              min={0}
              step="0.01"
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
              disabled={isReadOnly}
              className={inputCls}
            />
          </Field>
          <Field label="Shipping / handling">
            <input
              type="number"
              min={0}
              step="0.01"
              value={shippingAmount}
              onChange={(e) => setShippingAmount(Number(e.target.value))}
              disabled={isReadOnly}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Remarks / payment instructions">
          <textarea
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            rows={4}
            disabled={isReadOnly}
            className={inputCls}
          />
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
            <header className="flex items-start justify-between border-b-2 border-slate-200 pb-4">
              <div>
                {initial.companyLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={initial.companyLogoUrl} alt={companyName} style={{ maxHeight: 52, marginBottom: 8 }} />
                ) : null}
                <p className="text-lg font-bold text-slate-900">{companyName}</p>
                {companyAddress ? (
                  <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{companyAddress}</p>
                ) : null}
                {companyContact ? (
                  <p className="mt-1 whitespace-pre-line text-xs text-slate-600">{companyContact}</p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tracking-wide text-slate-900">INVOICE</p>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-slate-700">
                  <span className="font-semibold uppercase">Date</span>
                  <span className="text-right">{todayIso}</span>
                  <span className="font-semibold uppercase">Invoice No.</span>
                  <span className="text-right">{initial.invoiceNumber}</span>
                  {paymentTerms ? (
                    <>
                      <span className="font-semibold uppercase">Terms</span>
                      <span className="text-right">{paymentTerms}</span>
                    </>
                  ) : null}
                  {dueDate ? (
                    <>
                      <span className="font-semibold uppercase">Due</span>
                      <span className="text-right">{formatDateNice(dueDate)}</span>
                    </>
                  ) : null}
                </div>
              </div>
            </header>

            <section className="mt-6 grid grid-cols-2 gap-6">
              <PartyBlock title="BILL TO" party={billTo} />
              <PartyBlock title="SHIP TO" party={shipTo} />
            </section>

            <section className="mt-6">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-900 text-white">
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Description</th>
                    <th className="w-16 px-3 py-2 text-right text-xs font-semibold uppercase">Qty</th>
                    <th className="w-28 px-3 py-2 text-right text-xs font-semibold uppercase">Unit Price</th>
                    <th className="w-28 px-3 py-2 text-right text-xs font-semibold uppercase">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, index) => (
                    <tr key={index} className="border-b border-slate-200">
                      <td className="px-3 py-2 align-top">{item.description || "—"}</td>
                      <td className="px-3 py-2 text-right align-top">{item.quantity}</td>
                      <td className="px-3 py-2 text-right align-top">{formatMoney(formattedCurrency, item.unitPrice)}</td>
                      <td className="px-3 py-2 text-right align-top">
                        {formatMoney(formattedCurrency, round2(item.quantity * item.unitPrice))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="mt-6 grid grid-cols-2 gap-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Remarks / Payment Instructions</p>
                <p className="mt-2 whitespace-pre-line text-xs text-slate-700">
                  {remarks || "—"}
                </p>
              </div>
              <div className="space-y-1 text-sm text-slate-800">
                <TotalRow label="Subtotal" value={formatMoney(formattedCurrency, totals.subtotal)} />
                <TotalRow label="Discount" value={`- ${formatMoney(formattedCurrency, totals.discount)}`} />
                <TotalRow label="Subtotal less discount" value={formatMoney(formattedCurrency, totals.subtotalAfterDiscount)} />
                <TotalRow label={`Tax rate`} value={`${taxRate.toFixed(2)} %`} />
                <TotalRow label="Total tax" value={formatMoney(formattedCurrency, totals.taxAmount)} />
                <TotalRow label="Shipping / handling" value={formatMoney(formattedCurrency, totals.shipping)} />
                <div className="mt-2 flex items-center justify-between border-t-2 border-slate-900 pt-2">
                  <span className="text-sm font-bold uppercase">Balance Due</span>
                  <span className="text-base font-bold">{formatMoney(formattedCurrency, totals.balanceDue)}</span>
                </div>
              </div>
            </section>
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

function PartyFieldset({
  title,
  party,
  onChange,
  disabled,
}: {
  title: string;
  party: InvoiceBuilderInitial["billTo"];
  onChange: (next: InvoiceBuilderInitial["billTo"]) => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="rounded-lg border border-slate-200 p-3">
      <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</legend>
      <div className="space-y-2">
        <input value={party.name} onChange={(e) => onChange({ ...party, name: e.target.value })} placeholder="Contact name" disabled={disabled} className={inputCls} />
        <input value={party.company} onChange={(e) => onChange({ ...party, company: e.target.value })} placeholder="Company" disabled={disabled} className={inputCls} />
        <textarea value={party.address} onChange={(e) => onChange({ ...party, address: e.target.value })} placeholder="Address" rows={2} disabled={disabled} className={inputCls} />
        <input value={party.phone} onChange={(e) => onChange({ ...party, phone: e.target.value })} placeholder="Phone" disabled={disabled} className={inputCls} />
        <input value={party.email} onChange={(e) => onChange({ ...party, email: e.target.value })} placeholder="Email" disabled={disabled} className={inputCls} />
      </div>
    </fieldset>
  );
}

function PartyBlock({ title, party }: { title: string; party: InvoiceBuilderInitial["billTo"] }) {
  const lines = [party.name, party.company, party.address, party.phone, party.email].filter((line) => line && line.trim().length > 0);
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">{title}</p>
      {lines.length === 0 ? (
        <p className="mt-1 text-xs text-slate-400">—</p>
      ) : (
        <div className="mt-1 space-y-0.5 text-xs text-slate-800">
          {lines.map((line, i) => (
            <p key={i} className="whitespace-pre-line">
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-600">{label}</span>
      <span className="font-medium text-slate-900">{value}</span>
    </div>
  );
}

function calculateTotals(items: LineItem[], discount: number, taxRate: number, shipping: number) {
  const subtotal = round2(items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0));
  const discountAmount = round2(Math.max(0, discount || 0));
  const subtotalAfterDiscount = round2(Math.max(0, subtotal - discountAmount));
  const taxPercent = Math.max(0, taxRate || 0);
  const taxAmount = round2(subtotalAfterDiscount * (taxPercent / 100));
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

function formatDateNice(value: string) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
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
