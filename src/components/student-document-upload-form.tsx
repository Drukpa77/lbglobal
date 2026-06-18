"use client";

import type { BlobAccessType } from "@vercel/blob";
import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  MAX_STUDENT_DOCUMENT_DIRECT_UPLOAD_BYTES,
  MAX_STUDENT_DOCUMENT_DIRECT_UPLOAD_MB,
} from "@/lib/upload-limits";

type DocumentCategoryOption = {
  value: string;
  label: string;
};

type UploadState =
  | { status: "idle"; message: null; progress: number }
  | { status: "uploading"; message: string; progress: number }
  | { status: "success"; message: string; progress: number }
  | { status: "error"; message: string; progress: number };

const ACCEPTED_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".doc",
  ".docx",
]);

function extensionFromName(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return dot >= 0 ? fileName.slice(dot).toLowerCase() : "";
}

function mimeFromExtension(ext: string) {
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".doc") return "application/msword";
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "application/octet-stream";
}

function randomSuffix() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function uploadPath(studentId: string, file: File) {
  const ext = extensionFromName(file.name) || ".bin";
  return `student-docs/${studentId}/${Date.now()}-${randomSuffix()}${ext}`;
}

type StudentDocumentUploadFormProps = {
  studentId: string;
  blobAccess: BlobAccessType;
  categoryOptions: DocumentCategoryOption[];
};

export function StudentDocumentUploadForm({
  studentId,
  blobAccess,
  categoryOptions,
}: StudentDocumentUploadFormProps) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({
    status: "idle",
    message: null,
    progress: 0,
  });

  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const title = String(formData.get("title") ?? "").trim();
        const category = String(formData.get("category") ?? "OTHER");
        const file = formData.get("file");

        if (!title || !(file instanceof File) || file.size === 0) {
          setState({
            status: "error",
            message: "Choose a file and enter a document title.",
            progress: 0,
          });
          return;
        }

        const ext = extensionFromName(file.name);
        if (!ACCEPTED_EXTENSIONS.has(ext)) {
          setState({
            status: "error",
            message: "Only PDF, Word documents, and common image files are accepted.",
            progress: 0,
          });
          return;
        }

        if (file.size > MAX_STUDENT_DOCUMENT_DIRECT_UPLOAD_BYTES) {
          setState({
            status: "error",
            message: `This file is over ${MAX_STUDENT_DOCUMENT_DIRECT_UPLOAD_MB} MB. Compress or split the PDF and try again.`,
            progress: 0,
          });
          return;
        }

        try {
          setState({ status: "uploading", message: "Uploading document...", progress: 0 });
          await upload(uploadPath(studentId, file), file, {
            access: blobAccess,
            handleUploadUrl: "/api/student-documents/upload",
            contentType: file.type || mimeFromExtension(ext),
            multipart: file.size > 8 * 1024 * 1024,
            clientPayload: JSON.stringify({
              mode: "new",
              studentId,
              title,
              category,
              originalFileName: file.name,
              sizeBytes: file.size,
              mimeType: file.type || mimeFromExtension(ext),
            }),
            onUploadProgress: ({ percentage }) => {
              setState({
                status: "uploading",
                message: "Uploading document...",
                progress: Math.round(percentage),
              });
            },
          });

          form.reset();
          setState({
            status: "success",
            message: "Document uploaded.",
            progress: 100,
          });
          router.refresh();
        } catch (error) {
          console.error("StudentDocumentUploadForm", error);
          setState({
            status: "error",
            message: "Upload failed. Check the file size/type and try again.",
            progress: 0,
          });
        }
      }}
    >
      <input type="hidden" name="studentId" value={studentId} />
      {state.message ? (
        <p
          className={`col-span-full text-sm font-medium ${
            state.status === "error" ? "text-red-600" : "text-emerald-700"
          }`}
          role="status"
        >
          {state.message}
          {state.status === "uploading" ? ` ${state.progress}%` : ""}
        </p>
      ) : null}
      <input
        name="title"
        required
        placeholder="Document title"
        className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
      />
      <select
        name="category"
        defaultValue="OTHER"
        className="rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 focus:border-rose-400 focus:outline-none focus:ring-1 focus:ring-rose-400"
      >
        {categoryOptions.map((category) => (
          <option key={category.value} value={category.value}>
            {category.label}
          </option>
        ))}
      </select>
      <input
        name="file"
        type="file"
        required
        accept=".pdf,.doc,.docx,image/*"
        className="rounded-lg border border-slate-300 px-4 py-2.5 text-base file:mr-4 file:rounded-lg file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-slate-700 hover:file:bg-slate-200"
      />
      <button
        type="submit"
        disabled={state.status === "uploading"}
        className="rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state.status === "uploading" ? "Uploading..." : "Upload"}
      </button>
    </form>
  );
}

type ReplacementDocumentUploadFormProps = {
  studentId: string;
  documentId: string;
  blobAccess: BlobAccessType;
};

export function ReplacementDocumentUploadForm({
  studentId,
  documentId,
  blobAccess,
}: ReplacementDocumentUploadFormProps) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({
    status: "idle",
    message: null,
    progress: 0,
  });

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const formData = new FormData(form);
        const title = String(formData.get("title") ?? "").trim();
        const file = formData.get("file");

        if (!(file instanceof File) || file.size === 0) {
          setState({ status: "error", message: "Choose a replacement file.", progress: 0 });
          return;
        }

        const ext = extensionFromName(file.name);
        if (!ACCEPTED_EXTENSIONS.has(ext)) {
          setState({
            status: "error",
            message: "Only PDF, Word documents, and common image files are accepted.",
            progress: 0,
          });
          return;
        }

        if (file.size > MAX_STUDENT_DOCUMENT_DIRECT_UPLOAD_BYTES) {
          setState({
            status: "error",
            message: `This file is over ${MAX_STUDENT_DOCUMENT_DIRECT_UPLOAD_MB} MB.`,
            progress: 0,
          });
          return;
        }

        try {
          setState({ status: "uploading", message: "Uploading replacement...", progress: 0 });
          await upload(uploadPath(studentId, file), file, {
            access: blobAccess,
            handleUploadUrl: "/api/student-documents/upload",
            contentType: file.type || mimeFromExtension(ext),
            multipart: file.size > 8 * 1024 * 1024,
            clientPayload: JSON.stringify({
              mode: "replacement",
              studentId,
              documentId,
              title,
              originalFileName: file.name,
              sizeBytes: file.size,
              mimeType: file.type || mimeFromExtension(ext),
            }),
            onUploadProgress: ({ percentage }) => {
              setState({
                status: "uploading",
                message: "Uploading replacement...",
                progress: Math.round(percentage),
              });
            },
          });

          form.reset();
          setState({ status: "success", message: "Replacement uploaded.", progress: 100 });
          router.refresh();
        } catch (error) {
          console.error("ReplacementDocumentUploadForm", error);
          setState({
            status: "error",
            message: "Replacement upload failed. Check the file and try again.",
            progress: 0,
          });
        }
      }}
    >
      {state.message ? (
        <p
          className={`w-full text-xs font-medium ${
            state.status === "error" ? "text-red-600" : "text-emerald-700"
          }`}
          role="status"
        >
          {state.message}
          {state.status === "uploading" ? ` ${state.progress}%` : ""}
        </p>
      ) : null}
      <input type="hidden" name="studentId" value={studentId} />
      <input type="hidden" name="documentId" value={documentId} />
      <input
        name="title"
        placeholder="Replacement title (optional)"
        className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm text-emerald-900 placeholder:text-emerald-500 focus:border-emerald-400 focus:outline-none focus:ring-1 focus:ring-emerald-400"
      />
      <input
        name="file"
        type="file"
        required
        accept=".pdf,.doc,.docx,image/*"
        className="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm text-emerald-900 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:text-xs file:font-medium file:text-emerald-800 hover:file:bg-emerald-100"
      />
      <button
        type="submit"
        disabled={state.status === "uploading"}
        className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state.status === "uploading" ? "Uploading..." : "Upload Replacement"}
      </button>
    </form>
  );
}
