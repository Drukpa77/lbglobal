"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { MAX_STUDENT_DOCUMENT_UPLOAD_MB } from "@/lib/upload-limits";

const TASK_ERROR_MESSAGES: Record<string, string> = {
  "not-assigned": "You can only create tasks for students assigned to you.",
  "sub-admin-access": "You don't have access to create tasks for this student.",
  "no-profile": "This student does not have a profile yet.",
  "missing-title": "Enter a task title before saving.",
};

const DOCUMENT_UPLOAD_MESSAGES: Record<string, string> = {
  "blob-token":
    "File storage is not wired up yet. In Vercel: add a Blob store and set BLOB_READ_WRITE_TOKEN on this deployment (Production + Preview).",
  "file-too-large": `That file is too large for this form (max about ${MAX_STUDENT_DOCUMENT_UPLOAD_MB} MB on Vercel). Compress the PDF or use a smaller image.`,
  generic:
    `Document upload failed. Use a PDF or image under ${MAX_STUDENT_DOCUMENT_UPLOAD_MB} MB, confirm your connection, and try again.`,
};

export function TaskActionToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [toast, setToast] = useState<{ variant: "success" | "error"; message: string } | null>(
    null,
  );

  useEffect(() => {
    const created = searchParams.get("taskCreated") === "1";
    const errCode = searchParams.get("taskError");
    const uploadErr = searchParams.get("uploadError");

    if (!created && !errCode && !uploadErr) return;

    queueMicrotask(() => {
      if (created) {
        setToast({ variant: "success", message: "Task created." });
      } else if (errCode) {
        setToast({
          variant: "error",
          message: TASK_ERROR_MESSAGES[errCode] ?? "Something went wrong while saving the task.",
        });
      } else if (uploadErr) {
        setToast({
          variant: "error",
          message: DOCUMENT_UPLOAD_MESSAGES[uploadErr] ?? DOCUMENT_UPLOAD_MESSAGES.generic,
        });
      }

      const params = new URLSearchParams(searchParams.toString());
      params.delete("taskCreated");
      params.delete("taskError");
      params.delete("uploadError");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!toast) return null;

  const tone =
    toast.variant === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : "border-amber-200 bg-amber-50 text-amber-950";

  return (
    <div
      role="status"
      className={`pointer-events-none fixed right-4 top-4 z-50 max-w-sm rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${tone}`}
    >
      {toast.message}
    </div>
  );
}
