"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type ContractBuilderInitial = {
  contractId: string;
  contractNumber: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  subject: string;
  recipientEmail: string;
  contractDate: string;
  applicantTitle: string;
  applicantName: string;
  applicantCid: string;
  organizationName: string;
  hasDependent: boolean;
  dependentName: string;
  witnessName: string;
  witnessCid: string;
  witnessContact: string;
  companyLogoUrl: string | null;
  studentReturnUrl: string;
};

export function ContractBuilder({ initial }: { initial: ContractBuilderInitial }) {
  const router = useRouter();
  const previewRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [sendStatus, setSendStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [downloadStatus, setDownloadStatus] = useState<"idle" | "preparing" | "ready" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [subject, setSubject] = useState(initial.subject);
  const [recipientEmail, setRecipientEmail] = useState(initial.recipientEmail);
  const [contractDate, setContractDate] = useState(initial.contractDate);
  const [applicantTitle, setApplicantTitle] = useState(initial.applicantTitle);
  const [applicantName, setApplicantName] = useState(initial.applicantName);
  const [applicantCid, setApplicantCid] = useState(initial.applicantCid);
  const [organizationName, setOrganizationName] = useState(initial.organizationName);
  const [hasDependent, setHasDependent] = useState(initial.hasDependent);
  const [dependentName, setDependentName] = useState(initial.dependentName);
  const [witnessName, setWitnessName] = useState(initial.witnessName);
  const [witnessCid, setWitnessCid] = useState(initial.witnessCid);
  const [witnessContact, setWitnessContact] = useState(initial.witnessContact);

  const isReadOnly = initial.status !== "DRAFT";

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
      link.download = `${initial.contractNumber || "contract"}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloadStatus("ready");
    } catch {
      setDownloadStatus("error");
    }
  }

  function buildPayload() {
    return {
      subject,
      recipientEmail,
      contractDate,
      applicantTitle,
      applicantName,
      applicantCid,
      organizationName,
      hasDependent,
      dependentName,
      witnessName,
      witnessCid,
      witnessContact,
      previewHtml: previewRef.current?.outerHTML ?? "",
    };
  }

  async function saveDraft() {
    setSaveStatus("saving");
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/contracts/${initial.contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!res.ok) throw new Error((await res.text().catch(() => "")) || `Save failed (${res.status})`);
      setSaveStatus("saved");
      startTransition(() => router.refresh());
    } catch (e) {
      setSaveStatus("error");
      setErrorMessage(e instanceof Error ? e.message : "Save failed.");
    }
  }

  async function sendContract() {
    setSendStatus("sending");
    setErrorMessage(null);
    try {
      const saveRes = await fetch(`/api/contracts/${initial.contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildPayload()),
      });
      if (!saveRes.ok) throw new Error((await saveRes.text().catch(() => "")) || `Save failed (${saveRes.status})`);

      const pdfBlob = await generatePdfBlob();
      const pdfBase64 = await blobToBase64(pdfBlob);

      const sendRes = await fetch(`/api/contracts/${initial.contractId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdfBase64, pdfFilename: `${initial.contractNumber || "contract"}.pdf` }),
      });
      if (!sendRes.ok) throw new Error((await sendRes.text().catch(() => "")) || `Send failed (${sendRes.status})`);
      setSendStatus("sent");
      startTransition(() => router.refresh());
    } catch (e) {
      setSendStatus("error");
      setErrorMessage(e instanceof Error ? e.message : "Send failed.");
    }
  }

  const displayApplicant = applicantName
    ? `${applicantTitle ? `${applicantTitle} ` : ""}${applicantName}`
    : `${applicantTitle ? `${applicantTitle} ` : ""}______________________`;
  const displayCid = applicantCid || "______________________";
  const displayOrg = organizationName || "______________________";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* ── Left: form ─────────────────────────────────────────── */}
      <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Contract Details</h2>
            <p className="text-xs text-slate-500">
              {initial.contractNumber} · Status: {initial.status}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={downloadPdf}
              disabled={downloadStatus === "preparing" || isPending}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              {downloadStatus === "preparing" ? "Preparing…" : "Download PDF"}
            </button>
            {!isReadOnly && (
              <button
                type="button"
                onClick={saveDraft}
                disabled={saveStatus === "saving" || isPending}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                {saveStatus === "saving" ? "Saving…" : saveStatus === "saved" ? "Saved ✓" : "Save Draft"}
              </button>
            )}
            {!isReadOnly && (
              <button
                type="button"
                onClick={sendContract}
                disabled={sendStatus === "sending" || isPending}
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {sendStatus === "sending" ? "Sending…" : sendStatus === "sent" ? "Sent ✓" : "Send with PDF"}
              </button>
            )}
          </div>
        </div>

        {errorMessage && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
            {errorMessage}
          </div>
        )}

        <Field label="Email subject">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} disabled={isReadOnly} className={inputCls} />
        </Field>

        <Field label="Recipient email">
          <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} disabled={isReadOnly} className={inputCls} />
        </Field>

        <Field label="Contract date">
          <input value={contractDate} onChange={(e) => setContractDate(e.target.value)} placeholder="e.g. June 6, 2026" disabled={isReadOnly} className={inputCls} />
        </Field>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Applicant</legend>
          <div className="space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <Field label="Title">
                <select value={applicantTitle} onChange={(e) => setApplicantTitle(e.target.value)} disabled={isReadOnly} className={inputCls}>
                  <option value="">—</option>
                  <option>Mr.</option>
                  <option>Ms.</option>
                  <option>Mrs.</option>
                  <option>Dr.</option>
                </select>
              </Field>
              <div className="col-span-2">
                <Field label="Full name">
                  <input value={applicantName} onChange={(e) => setApplicantName(e.target.value)} placeholder="Full name" disabled={isReadOnly} className={inputCls} />
                </Field>
              </div>
            </div>
            <Field label="CID / Passport No.">
              <input value={applicantCid} onChange={(e) => setApplicantCid(e.target.value)} placeholder="e.g. 11902002516" disabled={isReadOnly} className={inputCls} />
            </Field>
          </div>
        </fieldset>

        <Field label="Organization name">
          <input value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} disabled={isReadOnly} className={inputCls} />
        </Field>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Dependent</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={hasDependent}
              onChange={(e) => setHasDependent(e.target.checked)}
              disabled={isReadOnly}
            />
            Applicant has a dependent
          </label>
          {hasDependent && (
            <div className="mt-2">
              <Field label="Dependent name">
                <input value={dependentName} onChange={(e) => setDependentName(e.target.value)} placeholder="Full name" disabled={isReadOnly} className={inputCls} />
              </Field>
            </div>
          )}
        </fieldset>

        <fieldset className="rounded-lg border border-slate-200 p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Witness</legend>
          <div className="space-y-2">
            <Field label="Name">
              <input value={witnessName} onChange={(e) => setWitnessName(e.target.value)} disabled={isReadOnly} className={inputCls} />
            </Field>
            <Field label="CID No.">
              <input value={witnessCid} onChange={(e) => setWitnessCid(e.target.value)} disabled={isReadOnly} className={inputCls} />
            </Field>
            <Field label="Contact details">
              <input value={witnessContact} onChange={(e) => setWitnessContact(e.target.value)} disabled={isReadOnly} className={inputCls} />
            </Field>
          </div>
        </fieldset>
      </div>

      {/* ── Right: live A4 preview ───────────────────────────── */}
      <div className="overflow-auto rounded-2xl border border-slate-200 bg-slate-100 p-4">
        <div className="mx-auto" style={{ maxWidth: 794 }}>
          <div
            ref={previewRef}
            className="bg-white text-slate-900 shadow-lg"
            style={{ width: 794, minHeight: 1123, padding: 56, fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            {/* ── Header ─────────────────────────────────────── */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #1e293b", paddingBottom: 16, marginBottom: 24 }}>
              <div>
                {initial.companyLogoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={initial.companyLogoUrl}
                    alt={organizationName}
                    style={{ maxHeight: 56, display: "block", marginBottom: 6 }}
                    crossOrigin="anonymous"
                  />
                ) : null}
                <p style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", margin: 0 }}>{organizationName}</p>
              </div>
              <div style={{ textAlign: "right", fontSize: 11, color: "#475569" }}>
                <p style={{ margin: 0 }}>
                  <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Contract No.:</span>{" "}
                  {initial.contractNumber}
                </p>
                <p style={{ margin: "4px 0 0" }}>
                  <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Date:</span>{" "}
                  {contractDate || "______________________"}
                </p>
              </div>
            </div>

            {/* ── Title ──────────────────────────────────────── */}
            <h1 style={{ fontSize: 15, fontWeight: 700, textAlign: "center", textTransform: "uppercase", letterSpacing: "0.08em", color: "#0f172a", margin: "0 0 24px" }}>
              Declaration Form for Submission of Documents
            </h1>

            {/* ── Opening paragraph ──────────────────────────── */}
            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#1e293b", marginBottom: 18, textAlign: "justify" }}>
              I, <strong>{displayApplicant}</strong>, holding CID No.{" "}
              <strong>{displayCid}</strong>, hereby solemnly declare that all documents submitted to{" "}
              <strong>{displayOrg}</strong> are true, genuine, complete and authentic to the best of my knowledge.
            </p>

            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#1e293b", marginBottom: 10, fontWeight: 600 }}>
              I further declare that:
            </p>

            <ul style={{ fontSize: 12, lineHeight: 1.8, color: "#1e293b", paddingLeft: 22, marginBottom: 18 }}>
              {[
                "I have personally verified all the information and documents provided.",
                "None of the documents submitted are false, forged, altered or misleading in any manner.",
                "I fully understand that submission of false or fraudulent documents is a serious offence and may result in rejection of my application, cancellation of any approval granted and legal action in accordance with applicable laws.",
                "I accept full responsibility and liability for the accuracy and authenticity of all documents submitted.",
                "I agree to provide additional documents or clarification if required by the concerned authority.",
                "I understand that this declaration is binding and may be used as evidence in case of any discrepancies found in the future.",
                "I make this declaration voluntarily and in good faith, fully aware of the consequences of any false statement.",
              ].map((item, i) => (
                <li key={i} style={{ marginBottom: 6, textAlign: "justify" }}>{item}</li>
              ))}
            </ul>

            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#1e293b", marginBottom: 18, textAlign: "justify" }}>
              I further declare that if any of the documents submitted by me are found to be false, forged, misleading or tampered with at any stage, I shall be held fully responsible for the same. I understand and accept that legal action may be taken against me in accordance with applicable laws and I am willing to bear any penalties or consequences arising from such actions.
            </p>

            <p style={{ fontSize: 12, lineHeight: 1.8, color: "#1e293b", marginBottom: 32, textAlign: "justify" }}>
              I also confirm that <strong>{displayOrg}</strong> has acted only as a facilitator based on the documents and information provided by me and therefore shall not be held responsible or liable for any issues, discrepancies or legal consequences arising in the future due to submission of false or fraudulent documents.
            </p>

            {/* ── Signature block (Applicant + Dependent) ────── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 32 }}>
              <SignatureBlock
                label="Signature of Applicant"
                showDate
                name={applicantName}
              />
              <SignatureBlock
                label={`Signature of Dependent${hasDependent && dependentName ? ` (${dependentName})` : " (if applicable)"}`}
                showDate
                name={hasDependent ? dependentName : undefined}
              />
            </div>

            {/* ── Witness block ───────────────────────────────── */}
            <div style={{ borderTop: "1px solid #cbd5e1", paddingTop: 20 }}>
              <p style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#475569", marginBottom: 16 }}>
                Witness
              </p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, fontSize: 11, color: "#1e293b" }}>
                <div>
                  <div style={{ borderBottom: "1px solid #1e293b", height: 36, marginBottom: 4 }} />
                  <p style={{ margin: 0, fontSize: 10, color: "#64748b" }}>Signature of Witness</p>
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.9 }}>
                  <LabelLine label="Name" value={witnessName} />
                  <LabelLine label="CID Number" value={witnessCid} />
                  <LabelLine label="Contact Details" value={witnessContact} />
                  <LabelLine label="Date" value="" />
                </div>
              </div>
            </div>

            {/* ── Footer ─────────────────────────────────────── */}
            <div style={{ marginTop: 40, textAlign: "center", fontSize: 9, color: "#94a3b8", borderTop: "1px solid #e2e8f0", paddingTop: 10 }}>
              {initial.contractNumber} · {displayOrg} · This document is legally binding.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function SignatureBlock({ label, showDate, name }: { label: string; showDate?: boolean; name?: string }) {
  return (
    <div style={{ fontSize: 11, color: "#1e293b" }}>
      {showDate && (
        <p style={{ margin: "0 0 10px", fontSize: 10, color: "#475569" }}>
          Date: ______________________
        </p>
      )}
      <div style={{ borderBottom: "1px solid #1e293b", height: 44, marginBottom: 6 }} />
      <p style={{ margin: 0, fontSize: 10, color: "#475569" }}>{label}</p>
      {name && <p style={{ margin: "2px 0 0", fontSize: 10, color: "#1e293b" }}>{name}</p>}
    </div>
  );
}

function LabelLine({ label, value }: { label: string; value: string }) {
  return (
    <p style={{ margin: 0 }}>
      <span style={{ fontWeight: 600 }}>{label}: </span>
      {value || <span style={{ color: "#94a3b8" }}>______________________</span>}
    </p>
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

async function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result ?? "");
      resolve(result.includes(",") ? result.split(",", 2)[1]! : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read PDF"));
    reader.readAsDataURL(blob);
  });
}
