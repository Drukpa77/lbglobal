"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { extractTemplatePlaceholders, renderTemplate } from "@/lib/template-renderer";

type TemplateEditorProps = {
  initialSubject: string;
  initialHtmlBody: string;
};

const SAMPLE_VALUES: Record<string, string> = {
  studentName: "John Doe",
  email: "john@example.com",
  targetCourse: "Master of Business Analytics",
  senderName: "L&B Global Team",
  invoiceNumber: "INV-2026-001",
  currency: "AUD",
  totalAmount: "2,200.00",
  dueDate: "20 Mar 2026",
};

const COMMON_PLACEHOLDERS = [
  "studentName",
  "email",
  "targetCourse",
  "senderName",
  "invoiceNumber",
  "currency",
  "totalAmount",
  "dueDate",
];

export function TemplateEditor({ initialSubject, initialHtmlBody }: TemplateEditorProps) {
  const [subject, setSubject] = useState(initialSubject);
  const [htmlBody, setHtmlBody] = useState(initialHtmlBody);
  const [showHtmlSource, setShowHtmlSource] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);

  const placeholders = useMemo(
    () => extractTemplatePlaceholders(`${subject} ${htmlBody}`),
    [subject, htmlBody],
  );

  const allPlaceholderChips = useMemo(
    () => Array.from(new Set([...COMMON_PLACEHOLDERS, ...placeholders])),
    [placeholders],
  );

  const previewValues = useMemo(() => {
    return placeholders.reduce<Record<string, string>>((acc, key) => {
      acc[key] = SAMPLE_VALUES[key] ?? `[${key}]`;
      return acc;
    }, {});
  }, [placeholders]);

  const previewSubject = useMemo(
    () => renderTemplate(subject, previewValues),
    [subject, previewValues],
  );
  const previewHtml = useMemo(
    () => renderTemplate(htmlBody, previewValues),
    [htmlBody, previewValues],
  );

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== htmlBody) {
      editor.innerHTML = htmlBody || "<p></p>";
    }
  }, [htmlBody]);

  function syncFromEditor() {
    const next = editorRef.current?.innerHTML ?? "";
    setHtmlBody(next);
  }

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncFromEditor();
  }

  function insertPlaceholder(key: string) {
    runCommand("insertText", `{{${key}}}`);
  }

  function insertLink() {
    const url = window.prompt("Enter URL", "https://");
    if (!url) return;
    runCommand("createLink", url);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3 rounded-lg border bg-white p-4">
        <p className="text-sm font-semibold text-slate-900">Editor</p>
        <label className="block text-sm">
          Subject
          <input
            name="subject"
            required
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => runCommand("bold")} className="rounded-md border px-2 py-1 text-xs">Bold</button>
          <button type="button" onClick={() => runCommand("italic")} className="rounded-md border px-2 py-1 text-xs">Italic</button>
          <button type="button" onClick={() => runCommand("underline")} className="rounded-md border px-2 py-1 text-xs">Underline</button>
          <button type="button" onClick={() => runCommand("formatBlock", "h2")} className="rounded-md border px-2 py-1 text-xs">Heading</button>
          <button type="button" onClick={() => runCommand("formatBlock", "p")} className="rounded-md border px-2 py-1 text-xs">Paragraph</button>
          <button type="button" onClick={() => runCommand("insertUnorderedList")} className="rounded-md border px-2 py-1 text-xs">Bullet list</button>
          <button type="button" onClick={() => runCommand("insertOrderedList")} className="rounded-md border px-2 py-1 text-xs">Number list</button>
          <button type="button" onClick={insertLink} className="rounded-md border px-2 py-1 text-xs">Link</button>
          <button type="button" onClick={() => runCommand("removeFormat")} className="rounded-md border px-2 py-1 text-xs">Clear format</button>
        </div>

        <div className="rounded-md border bg-slate-50 p-2">
          <p className="mb-2 text-xs font-medium text-slate-600">Insert placeholder</p>
          <div className="flex flex-wrap gap-2">
            {allPlaceholderChips.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => insertPlaceholder(key)}
                className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-700"
              >
                {`{{${key}}}`}
              </button>
            ))}
          </div>
        </div>

        <label className="block text-sm">
          Message Body
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={syncFromEditor}
            className="mt-1 min-h-[24rem] w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none"
          />
        </label>

        <textarea name="htmlBody" value={htmlBody} readOnly className="hidden" />

        <div className="rounded-md border border-slate-200 p-3">
          <button
            type="button"
            onClick={() => setShowHtmlSource((v) => !v)}
            className="text-xs font-medium text-blue-700 underline"
          >
            {showHtmlSource ? "Hide advanced HTML" : "Show advanced HTML"}
          </button>
          {showHtmlSource && (
            <textarea
              value={htmlBody}
              onChange={(e) => setHtmlBody(e.target.value)}
              className="mt-2 min-h-40 w-full rounded-md border bg-white px-3 py-2 font-mono text-xs"
            />
          )}
        </div>
      </div>

      <div className="space-y-3 rounded-lg border bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">Live Preview</p>
        <div className="rounded-md border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Subject</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{previewSubject}</p>
        </div>
        <article
          className="prose max-w-none rounded-md border bg-white p-4"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
        <div className="rounded-md border bg-white p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">Detected placeholders</p>
          <p className="mt-1 text-sm text-slate-700">{placeholders.join(", ") || "None"}</p>
        </div>
      </div>
    </div>
  );
}
