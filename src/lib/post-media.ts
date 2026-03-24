import fs from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const ALLOWED_IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);
const ALLOWED_VIDEO_MIME = new Set([
  "video/mp4",
  "video/webm",
  "video/ogg",
]);

export type SavedMedia = {
  url: string;
  mediaType: "IMAGE" | "VIDEO";
};

function safeExtFromMime(mime: string) {
  if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
  if (mime.includes("png")) return "png";
  if (mime.includes("webp")) return "webp";
  if (mime.includes("webm")) return "webm";
  if (mime.includes("ogg")) return "ogg";
  return "mp4";
}

function makeName(prefix: string, extension: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
}

export async function savePostMedia(file: File, prefix = "post") {
  if (!file || file.size === 0) return null;

  const uploadDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadDir, { recursive: true });

  if (ALLOWED_IMAGE_MIME.has(file.type)) {
    if (file.size > MAX_IMAGE_BYTES) {
      throw new Error("Image file exceeds maximum size (8MB).");
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const optimized = await sharp(buffer)
      .rotate()
      .resize({ width: 1920, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    const fileName = makeName(prefix, "webp");
    await fs.writeFile(path.join(uploadDir, fileName), optimized);
    return { url: `/uploads/${fileName}`, mediaType: "IMAGE" as const };
  }

  if (ALLOWED_VIDEO_MIME.has(file.type)) {
    if (file.size > MAX_VIDEO_BYTES) {
      throw new Error("Video file exceeds maximum size (50MB).");
    }
    const extension = safeExtFromMime(file.type);
    const fileName = makeName(prefix, extension);
    await fs.writeFile(
      path.join(uploadDir, fileName),
      Buffer.from(await file.arrayBuffer()),
    );
    return { url: `/uploads/${fileName}`, mediaType: "VIDEO" as const };
  }

  throw new Error("Unsupported media type.");
}

