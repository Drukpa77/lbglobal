"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  initialHtml: string;
  inputName?: string;
  label?: string;
};

export function PostRichEditor({
  initialHtml,
  inputName = "contentHtml",
  label = "Content",
}: Props) {
  const [html, setHtml] = useState(initialHtml || "<p></p>");
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.innerHTML !== html) {
      editor.innerHTML = html;
    }
  }, [html]);

  function syncFromEditor() {
    const next = editorRef.current?.innerHTML ?? "";
    setHtml(next);
  }

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    syncFromEditor();
  }

  function insertLink() {
    const url = window.prompt("Enter URL", "https://");
    if (!url) return;
    runCommand("createLink", url);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-gray-700">{label}</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => runCommand("bold")} className="rounded-md border px-2 py-1 text-xs">Bold</button>
        <button type="button" onClick={() => runCommand("italic")} className="rounded-md border px-2 py-1 text-xs">Italic</button>
        <button type="button" onClick={() => runCommand("underline")} className="rounded-md border px-2 py-1 text-xs">Underline</button>
        <button type="button" onClick={() => runCommand("formatBlock", "h2")} className="rounded-md border px-2 py-1 text-xs">H2</button>
        <button type="button" onClick={() => runCommand("formatBlock", "p")} className="rounded-md border px-2 py-1 text-xs">Paragraph</button>
        <button type="button" onClick={() => runCommand("insertUnorderedList")} className="rounded-md border px-2 py-1 text-xs">Bullet list</button>
        <button type="button" onClick={insertLink} className="rounded-md border px-2 py-1 text-xs">Link</button>
      </div>
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={syncFromEditor}
        className="min-h-[16rem] w-full rounded-md border bg-white px-3 py-2 text-sm focus:outline-none"
      />
      <textarea name={inputName} value={html} readOnly className="hidden" />
    </div>
  );
}

