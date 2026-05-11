/**
 * Max bytes for multipart uploads through Next.js Server Actions on Vercel.
 * Vercel serverless request bodies are capped around 4.5 MB; multipart overhead
 * must stay under that, so we use a conservative 4 MB ceiling.
 */
export const MAX_STUDENT_DOCUMENT_UPLOAD_BYTES = 4 * 1024 * 1024;

export const MAX_STUDENT_DOCUMENT_UPLOAD_MB = Math.floor(
  MAX_STUDENT_DOCUMENT_UPLOAD_BYTES / (1024 * 1024),
);
