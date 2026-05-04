import fs from "node:fs/promises";
import path from "node:path";

import { del, put } from "@vercel/blob";

function hasBlobToken() {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
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
    const uploaded = await put(blobPath, buffer, {
      access: "public",
      contentType: mimeType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
      addRandomSuffix: false,
    });
    return uploaded.url;
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
    await del(storagePath, { token: process.env.BLOB_READ_WRITE_TOKEN });
    return;
  }

  const localPath = path.join(process.cwd(), "public", storagePath.replace(/^\//, ""));
  await fs.unlink(localPath).catch(() => undefined);
}
