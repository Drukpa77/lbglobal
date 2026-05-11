import fs from "node:fs/promises";
import path from "node:path";

import { get } from "@vercel/blob";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getBlobStoreAccess } from "@/lib/blob-access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Streams a student document for staff. Required when blobs are stored with
 * `BLOB_STORE_ACCESS=private` (direct blob URLs are not browser-accessible).
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ studentId: string; documentId: string }> },
) {
  const { studentId, documentId } = await context.params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (
    session.user.role !== "ADMIN" &&
    session.user.role !== "SUB_ADMIN" &&
    session.user.role !== "INTERNAL_STAFF"
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (session.user.role === "SUB_ADMIN") {
    const allowed = await prisma.questionnaireSubmission.findFirst({
      where: {
        studentId,
        OR: [{ assignedToId: session.user.id }, { assignedToId: null }],
      },
      select: { id: true },
    });
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  if (session.user.role === "INTERNAL_STAFF") {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: studentId },
      select: { id: true },
    });
    if (!profile) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        studentProfileId: profile.id,
        assignedToId: session.user.id,
        isActive: true,
      },
      select: { id: true },
    });
    if (!assigned) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const doc = await prisma.studentDocument.findFirst({
    where: {
      id: documentId,
      studentProfile: { userId: studentId },
    },
    select: { storagePath: true, mimeType: true, title: true },
  });
  if (!doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { storagePath, mimeType, title } = doc;

  if (!/^https?:\/\//i.test(storagePath)) {
    const normalized = storagePath.replace(/^\/+/, "");
    const absolutePath = path.join(process.cwd(), "public", normalized);
    try {
      const body = await fs.readFile(absolutePath);
      return new NextResponse(body, {
        headers: {
          "Content-Type": mimeType || "application/octet-stream",
          "Content-Disposition": contentDispositionInline(title),
        },
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
    headers: {
      "Content-Type": mimeType || result.blob.contentType || "application/octet-stream",
      "Content-Disposition": contentDispositionInline(title),
    },
  });
}

function contentDispositionInline(filename: string) {
  const safe = filename.replace(/[\r\n"]/g, "_").slice(0, 200) || "document";
  return `inline; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
