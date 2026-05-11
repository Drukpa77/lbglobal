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
    "The app did not see BLOB_READ_WRITE_TOKEN on this deployment. In Vercel → Project → Settings → Environment Variables: add the exact name BLOB_READ_WRITE_TOKEN (read/write token from Storage → Blob), enable it for Production, then redeploy.",
  "blob-auth":
    "Blob rejected the token (wrong store, expired, or read-only token). In Vercel Storage open your Blob store, copy the read/write token again, paste as BLOB_READ_WRITE_TOKEN, redeploy, and ensure Preview vs Production envs match how you test.",
  "blob-store":
    "Blob store was not found or is suspended. In Vercel, confirm Storage → Blob is created and linked to this team/project.",
  "blob-content-type":
    "Blob rejected this content type. Try a standard PDF or JPEG/PNG export.",
  "blob-file-too-large":
    "This file exceeds the Blob store limit for uploads through the API. Use a smaller or compressed file.",
  "blob-pathname":
    "Blob rejected the file path. Try a simpler filename (letters, numbers, dot, hyphen).",
  "blob-rate-limit":
    "Blob rate limit reached. Wait a minute and try again.",
  "blob-unavailable":
    "Blob service was unavailable or the request was aborted. Try again in a moment.",
  "blob-failed":
    "Something went wrong while saving the file to Blob. Check Vercel function logs for this request.",
  "file-too-large": `That file is too large for this form (max about ${MAX_STUDENT_DOCUMENT_UPLOAD_MB} MB through the server). Compress the PDF or use a smaller image.`,
  "invalid-type":
    "Only PDF and common images (JPEG, PNG, WebP, GIF) are accepted. HEIC, Word, or other types often fail or report an empty type—export to PDF or JPEG.",
  "save-failed":
    "The file uploaded to storage, but saving the database record failed. Check DATABASE_URL and Vercel logs, then try again.",
  generic:
    "Upload could not be completed. Check file type and size, Vercel env vars (BLOB_READ_WRITE_TOKEN, DATABASE_URL), and function logs if it keeps happening.",
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
