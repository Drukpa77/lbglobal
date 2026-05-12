"use client";

import type { ReactNode } from "react";
import { useState } from "react";

import { MAX_STUDENT_DOCUMENT_UPLOAD_BYTES, MAX_STUDENT_DOCUMENT_UPLOAD_MB } from "@/lib/upload-limits";

type Props = {
  action: (formData: FormData) => Promise<void>;
  className?: string;
  children: ReactNode;
};

/**
 * Blocks submit when the chosen file exceeds {@link MAX_STUDENT_DOCUMENT_UPLOAD_BYTES}
 * so Vercel does not return 413 before the Server Action runs.
 */
export function FileSizeLimitedForm({ action, className, children }: Props) {
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        setError(null);
        const fileInput = e.currentTarget.querySelector<HTMLInputElement>('input[type="file"][name="file"]');
        const file = fileInput?.files?.[0];
        if (file && file.size > MAX_STUDENT_DOCUMENT_UPLOAD_BYTES) {
          e.preventDefault();
          setError(
            `This file is over ${MAX_STUDENT_DOCUMENT_UPLOAD_MB} MB. Hosted deployments cannot accept larger uploads through this form. Compress the PDF or use a smaller image, or split the document.`,
          );
        }
      }}
    >
      {error ? (
        <p className="col-span-full text-sm font-medium text-red-600" role="alert">
          {error}
        </p>
      ) : null}
      {children}
    </form>
  );
}
