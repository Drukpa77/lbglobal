import fs from "node:fs/promises";
import path from "node:path";

import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { getBlobStoreAccess } from "@/lib/blob-access";
import { prisma } from "@/lib/prisma";
import {
  internalStaffHasActiveAssignment,
  staffHasFullClientDirectory,
} from "@/lib/staff-client-access";

type StaffUser = {
  id: string;
  role: string;
};

type Disposition = "inline" | "attachment";

export async function getStudentDocumentForStaff({
  user,
  studentId,
  documentId,
}: {
  user: StaffUser;
  studentId: string;
  documentId: string;
}) {
  if (user.role !== "ADMIN" && user.role !== "SUB_ADMIN" && user.role !== "INTERNAL_STAFF") {
    return { error: "Forbidden" as const, status: 403 as const };
  }

  if (!staffHasFullClientDirectory(user.role) && user.role === "INTERNAL_STAFF") {
    const allowed = await internalStaffHasActiveAssignment(user.id, studentId);
    if (!allowed) {
      return { error: "Forbidden" as const, status: 403 as const };
    }
  }

  const document = await prisma.studentDocument.findFirst({
    where: {
      id: documentId,
      studentProfile: { userId: studentId },
    },
    select: {
      storagePath: true,
      mimeType: true,
      title: true,
      originalFileName: true,
    },
  });

  if (!document) {
    return { error: "Not found" as const, status: 404 as const };
  }

  return { document };
}

export async function streamStudentDocument(
  document: {
    storagePath: string;
    mimeType: string;
    title: string;
    originalFileName: string;
  },
  disposition: Disposition,
) {
  const { storagePath, mimeType, title, originalFileName } = document;
  const filename = filenameForDisposition(title, originalFileName);

  if (!/^https?:\/\//i.test(storagePath)) {
    const publicRoot = path.join(process.cwd(), "public");
    const absolutePath = path.resolve(publicRoot, storagePath.replace(/^\/+/, ""));
    if (!absolutePath.startsWith(publicRoot + path.sep)) {
      return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
    }

    try {
      const body = await fs.readFile(absolutePath);
      return new NextResponse(body, {
        headers: fileHeaders(mimeType, filename, disposition),
      });
    } catch {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }
  }

  const access = getBlobStoreAccess();
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) {
    return NextResponse.json({ error: "Blob token not configured" }, { status: 500 });
  }

  const result = await get(storagePath, { access, token });
  if (!result || result.statusCode !== 200 || !result.stream) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(result.stream, {
    headers: fileHeaders(mimeType || result.blob.contentType, filename, disposition),
  });
}

function fileHeaders(mimeType: string | null | undefined, filename: string, disposition: Disposition) {
  return {
    "Content-Type": mimeType || "application/octet-stream",
    "Content-Disposition": contentDisposition(disposition, filename),
    "X-Content-Type-Options": "nosniff",
  };
}

function filenameForDisposition(title: string, originalFileName: string) {
  const originalExtension = path.extname(originalFileName);
  const base = sanitizeFilename(title || path.basename(originalFileName, originalExtension) || "document");
  const extension = sanitizeExtension(originalExtension);
  return `${base}${base.toLowerCase().endsWith(extension.toLowerCase()) ? "" : extension}`;
}

function sanitizeFilename(filename: string) {
  return (
    filename
      .replace(/[\r\n"]/g, "_")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .trim()
      .slice(0, 180) || "document"
  );
}

function sanitizeExtension(extension: string) {
  if (!/^\.[A-Za-z0-9]{1,12}$/.test(extension)) return "";
  return extension;
}

function contentDisposition(disposition: Disposition, filename: string) {
  const fallback = filename.replace(/[^\x20-\x7E]/g, "_");
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
