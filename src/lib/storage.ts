import fs from "node:fs/promises";
import path from "node:path";

import { getBlobStoreAccess } from "@/lib/blob-access";

import {
  BlobAccessError,
  BlobClientTokenExpiredError,
  BlobContentTypeNotAllowedError,
  BlobError,
  BlobFileTooLargeError,
  BlobNotFoundError,
  BlobPathnameMismatchError,
  BlobPreconditionFailedError,
  BlobRequestAbortedError,
  BlobServiceNotAvailable,
  BlobServiceRateLimited,
  BlobStoreNotFoundError,
  BlobStoreSuspendedError,
  BlobUnknownError,
  del,
  put,
} from "@vercel/blob";

/** Throw this from uploads on Vercel when `BLOB_READ_WRITE_TOKEN` is missing (filesystem is not writable). */
export class StorageNotConfiguredError extends Error {
  constructor() {
    super(
      "File uploads require Vercel Blob. Set BLOB_READ_WRITE_TOKEN from your Blob store in Vercel project settings.",
    );
    this.name = "StorageNotConfiguredError";
  }
}

function hasBlobToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  return Boolean(token && String(token).trim());
}

/**
 * Maps @vercel/blob errors to short query keys for user-facing toasts.
 */
export function blobUploadFailureQueryKey(error: unknown): string | null {
  if (error instanceof BlobAccessError || error instanceof BlobClientTokenExpiredError) {
    return "blob-auth";
  }
  if (error instanceof BlobStoreNotFoundError || error instanceof BlobStoreSuspendedError) {
    return "blob-store";
  }
  if (error instanceof BlobContentTypeNotAllowedError) {
    return "blob-content-type";
  }
  if (error instanceof BlobFileTooLargeError) {
    return "blob-file-too-large";
  }
  if (error instanceof BlobPathnameMismatchError) {
    return "blob-pathname";
  }
  if (error instanceof BlobServiceRateLimited) {
    return "blob-rate-limit";
  }
  if (error instanceof BlobServiceNotAvailable || error instanceof BlobRequestAbortedError) {
    return "blob-unavailable";
  }
  if (
    error instanceof BlobNotFoundError ||
    error instanceof BlobPreconditionFailedError ||
    error instanceof BlobUnknownError ||
    error instanceof BlobError
  ) {
    return "blob-failed";
  }
  return null;
}

export function studentDocumentUploadErrorParam(error: unknown): string {
  if (error instanceof StorageNotConfiguredError) return "blob-token";
  if (error instanceof Error) {
    const msg = error.message;
    if (msg.includes("private store") && msg.includes("public access")) {
      return "blob-store-access-mismatch";
    }
  }
  return blobUploadFailureQueryKey(error) ?? "generic";
}

export async function uploadBufferToStorage({
  buffer,
  mimeType,
  blobPath,
  localRelativePath,
}: {
  buffer: Buffer;
  mimeType: string;
  blobPath: string;
  localRelativePath: string;
}) {
  if (hasBlobToken()) {
    const access = getBlobStoreAccess();
    const uploaded = await put(blobPath, buffer, {
      access,
      contentType: mimeType,
      token: process.env.BLOB_READ_WRITE_TOKEN?.trim(),
      addRandomSuffix: false,
    });
    return uploaded.url;
  }

  if (process.env.VERCEL) {
    throw new StorageNotConfiguredError();
  }

  const normalizedRelative = localRelativePath.replace(/^\/+/, "");
  const absolutePath = path.join(process.cwd(), "public", normalizedRelative);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, buffer);
  return `/${normalizedRelative.replace(/\\/g, "/")}`;
}

export async function deleteStoredFile(storagePath: string) {
  if (!storagePath) return;

  if (/^https?:\/\//i.test(storagePath)) {
    if (!hasBlobToken()) return;
    try {
      await del(storagePath, { token: process.env.BLOB_READ_WRITE_TOKEN?.trim() });
    } catch (error) {
      if (error instanceof BlobNotFoundError) return;
      throw error;
    }
    return;
  }

  const localPath = path.join(process.cwd(), "public", storagePath.replace(/^\//, ""));
  await fs.unlink(localPath).catch(() => undefined);
}
