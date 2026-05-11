import type { BlobAccessType } from "@vercel/blob";

/**
 * Must match your Vercel Blob **store** setting (Storage → Blob → store details).
 * - `public` — default; `put(..., { access: "public" })`; document URLs work directly in the browser.
 * - `private` — `put(..., { access: "private" })`; staff open files via `/api/students/.../documents/.../open` (auth + server-side fetch).
 */
export function getBlobStoreAccess(): BlobAccessType {
  const raw = process.env.BLOB_STORE_ACCESS?.trim().toLowerCase();
  return raw === "private" ? "private" : "public";
}

export function blobOpensThroughAuthenticatedApi(): boolean {
  return getBlobStoreAccess() === "private";
}
