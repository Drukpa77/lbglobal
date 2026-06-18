import path from "node:path";
import { createHash } from "node:crypto";

import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import type { DocumentCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { deleteStoredFile } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { revalidateContributionsCache } from "@/lib/contributions-cache";
import { createWorkflowNotification } from "@/lib/workflow-notifications";
import { MAX_STUDENT_DOCUMENT_DIRECT_UPLOAD_BYTES } from "@/lib/upload-limits";

export const runtime = "nodejs";

const ALLOWED_DOCUMENT_MIME = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  ".pdf",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".doc",
  ".docx",
]);

const DOCUMENT_CATEGORIES = new Set<DocumentCategory>([
  "PASSPORT",
  "TRANSCRIPT",
  "SOP",
  "OFFER_LETTER",
  "COE",
  "HEALTH_INSURANCE",
  "VISA",
  "FINANCIAL",
  "IDENTITY",
  "OTHER",
]);

type UploadPayload = {
  mode: "new" | "replacement";
  studentId: string;
  title?: string;
  category?: string;
  documentId?: string;
  originalFileName: string;
  sizeBytes: number;
  mimeType: string;
  actorId?: string;
};

type CompleteUploadBody = {
  action: "complete";
  payload: UploadPayload;
  blob: {
    url: string;
    pathname: string;
    contentType?: string;
  };
};

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody | CompleteUploadBody;

  try {
    if (isCompleteUploadBody(body)) {
      const session = await auth();
      if (
        !session?.user ||
        (session.user.role !== "ADMIN" &&
          session.user.role !== "SUB_ADMIN" &&
          session.user.role !== "INTERNAL_STAFF")
      ) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      const payload = parseUploadPayload(JSON.stringify(body.payload));
      validateUploadPayload(payload, body.blob.pathname);

      if (payload.mode === "new") {
        await assertNewDocumentAccess(payload.studentId, session.user);
        await saveNewDocumentUpload({ ...payload, actorId: session.user.id }, body.blob.url);
      } else {
        await assertReplacementDocumentAccess(payload.studentId, payload.documentId, session.user);
        await saveReplacementDocumentUpload(
          { ...payload, actorId: session.user.id },
          body.blob.url,
        );
      }

      return NextResponse.json({ ok: true });
    }

    const response = await handleUpload({
      request,
      body,
      token: process.env.BLOB_READ_WRITE_TOKEN?.trim(),
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const session = await auth();
        if (
          !session?.user ||
          (session.user.role !== "ADMIN" &&
            session.user.role !== "SUB_ADMIN" &&
            session.user.role !== "INTERNAL_STAFF")
        ) {
          throw new Error("Unauthorized");
        }

        const payload = parseUploadPayload(clientPayload);
        validateUploadPayload(payload, pathname);

        if (payload.mode === "new") {
          await assertNewDocumentAccess(payload.studentId, session.user);
        } else {
          await assertReplacementDocumentAccess(payload.studentId, payload.documentId, session.user);
        }

        return {
          allowedContentTypes: ALLOWED_DOCUMENT_MIME,
          maximumSizeInBytes: MAX_STUDENT_DOCUMENT_DIRECT_UPLOAD_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ ...payload, actorId: session.user.id }),
          callbackUrl: uploadCallbackUrl(),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parseUploadPayload(tokenPayload ?? null);
        if (!payload.actorId) throw new Error("Missing upload actor.");

        if (payload.mode === "new") {
          await saveNewDocumentUpload(payload, blob.url);
        } else {
          await saveReplacementDocumentUpload(payload, blob.url);
        }
      },
    });

    return NextResponse.json(response);
  } catch (error) {
    console.error("POST /api/student-documents/upload", error);
    return NextResponse.json({ error: "Upload could not be authorized." }, { status: 400 });
  }
}

function isCompleteUploadBody(body: HandleUploadBody | CompleteUploadBody): body is CompleteUploadBody {
  return (
    Boolean(body) &&
    typeof body === "object" &&
    "action" in body &&
    body.action === "complete"
  );
}

function parseUploadPayload(raw: string | null): UploadPayload {
  if (!raw) throw new Error("Missing upload payload.");
  const parsed = JSON.parse(raw) as Partial<UploadPayload>;
  if (parsed.mode !== "new" && parsed.mode !== "replacement") {
    throw new Error("Invalid upload mode.");
  }

  return {
    mode: parsed.mode,
    studentId: String(parsed.studentId ?? "").trim(),
    title: String(parsed.title ?? "").trim(),
    category: String(parsed.category ?? "OTHER").trim(),
    documentId: String(parsed.documentId ?? "").trim(),
    originalFileName: String(parsed.originalFileName ?? "").trim(),
    sizeBytes: Number(parsed.sizeBytes ?? 0),
    mimeType: String(parsed.mimeType ?? "").trim(),
    actorId: parsed.actorId ? String(parsed.actorId).trim() : undefined,
  };
}

function validateUploadPayload(payload: UploadPayload, pathname: string) {
  if (!payload.studentId || !payload.originalFileName || !payload.mimeType) {
    throw new Error("Missing upload details.");
  }
  if (!Number.isFinite(payload.sizeBytes) || payload.sizeBytes <= 0) {
    throw new Error("Invalid upload size.");
  }
  if (payload.sizeBytes > MAX_STUDENT_DOCUMENT_DIRECT_UPLOAD_BYTES) {
    throw new Error("Upload is too large.");
  }
  if (payload.mode === "new" && !payload.title?.trim()) {
    throw new Error("Document title is required.");
  }
  if (payload.mode === "replacement" && !payload.documentId) {
    throw new Error("Replacement document id is required.");
  }

  const originalExt = path.extname(payload.originalFileName).toLowerCase();
  const pathnameExt = path.extname(pathname).toLowerCase();
  if (
    !ALLOWED_DOCUMENT_EXTENSIONS.has(originalExt) ||
    !ALLOWED_DOCUMENT_EXTENSIONS.has(pathnameExt)
  ) {
    throw new Error("Document type is not allowed.");
  }
  if (!pathname.startsWith(`student-docs/${payload.studentId}/`)) {
    throw new Error("Upload path does not match student.");
  }
}

async function assertNewDocumentAccess(
  studentId: string,
  user: { id: string; role: string },
) {
  const studentProfile = await prisma.studentProfile.findUnique({
    where: { userId: studentId },
    select: { id: true },
  });
  if (!studentProfile) throw new Error("Student profile not found.");

  if (user.role === "INTERNAL_STAFF") {
    const assigned = await prisma.studentAssignment.findFirst({
      where: {
        assignedToId: user.id,
        isActive: true,
        studentProfileId: studentProfile.id,
      },
      select: { id: true },
    });
    if (!assigned) throw new Error("Not assigned to this client.");
  }
}

async function assertReplacementDocumentAccess(
  studentId: string,
  documentId: string | undefined,
  user: { id: string; role: string },
) {
  if (user.role !== "ADMIN" && user.role !== "INTERNAL_STAFF") {
    throw new Error("Unauthorized replacement upload.");
  }
  if (!documentId) throw new Error("Missing document id.");

  const document = await prisma.studentDocument.findUnique({
    where: { id: documentId },
    include: {
      studentProfile: {
        select: {
          userId: true,
          assignments: { where: { isActive: true }, select: { assignedToId: true } },
        },
      },
    },
  });
  if (!document || document.studentProfile.userId !== studentId) {
    throw new Error("Document not found.");
  }
  if (!document.returnedAt || !document.returnedById || document.returnResolvedAt) {
    throw new Error("Document is not awaiting replacement.");
  }

  if (user.role === "INTERNAL_STAFF") {
    const assigned = document.studentProfile.assignments.some(
      (assignment) => assignment.assignedToId === user.id,
    );
    if (!assigned) throw new Error("Not assigned to this client.");
  }
}

async function saveNewDocumentUpload(payload: UploadPayload, storagePath: string) {
  const documentId = documentIdForStoragePath(storagePath);
  try {
    const existing = await prisma.studentDocument.findFirst({
      where: { OR: [{ storagePath }, { id: documentId }] },
      select: { id: true },
    });
    if (existing) return;

    const studentProfile = await prisma.studentProfile.findUnique({
      where: { userId: payload.studentId },
      select: { id: true },
    });
    if (!studentProfile) throw new Error("Student profile not found.");

    const safeCategory: DocumentCategory = DOCUMENT_CATEGORIES.has(
      payload.category as DocumentCategory,
    )
      ? (payload.category as DocumentCategory)
      : "OTHER";

    const document = await prisma.studentDocument.create({
      data: {
        id: documentId,
        studentProfileId: studentProfile.id,
        uploadedById: payload.actorId!,
        category: safeCategory,
        title: payload.title!.trim(),
        originalFileName: payload.originalFileName,
        storagePath,
        mimeType: payload.mimeType,
        sizeBytes: payload.sizeBytes,
      },
      select: { id: true },
    });

    await prisma.activityLog.create({
      data: {
        actorId: payload.actorId!,
        targetStudentProfileId: studentProfile.id,
        entityType: "DOCUMENT",
        entityId: document.id,
        action: `Uploaded document: ${payload.title}`,
      },
    });

    revalidateContributionsCache(payload.studentId);
    revalidatePath(`/dashboard/students/${payload.studentId}`);
  } catch (error) {
    const existing = await prisma.studentDocument.findFirst({
      where: { OR: [{ storagePath }, { id: documentId }] },
      select: { id: true },
    });
    if (existing && isUniqueConstraintError(error)) return;

    await deleteStoredFile(storagePath).catch(() => undefined);
    throw error;
  }
}

async function saveReplacementDocumentUpload(payload: UploadPayload, storagePath: string) {
  const documentId = documentIdForStoragePath(storagePath);
  try {
    const existing = await prisma.studentDocument.findFirst({
      where: { OR: [{ storagePath }, { id: documentId }] },
      select: { id: true },
    });
    if (existing) return;

    const document = await prisma.studentDocument.findUnique({
      where: { id: payload.documentId },
      include: {
        studentProfile: {
          select: {
            id: true,
            userId: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    if (!document || document.studentProfile.userId !== payload.studentId) {
      throw new Error("Document not found.");
    }
    if (!document.returnedAt || !document.returnedById || document.returnResolvedAt) {
      throw new Error("Document is not awaiting replacement.");
    }

    const title = payload.title?.trim() || `${document.title} (Revised)`;
    const replacement = await prisma.studentDocument.create({
      data: {
        id: documentId,
        studentProfileId: document.studentProfileId,
        uploadedById: payload.actorId!,
        replacedDocumentId: document.id,
        category: document.category,
        title,
        originalFileName: payload.originalFileName,
        storagePath,
        mimeType: payload.mimeType,
        sizeBytes: payload.sizeBytes,
        verificationStatus: "PENDING",
        notes: document.returnedNote
          ? `Replacement uploaded for returned document. Return reason: ${document.returnedNote}`
          : "Replacement uploaded for returned document.",
      },
      select: { id: true },
    });

    await prisma.studentDocument.update({
      where: { id: document.id },
      data: { returnResolvedAt: new Date() },
    });

    await createWorkflowNotification({
      recipientId: document.returnedById,
      actorId: payload.actorId!,
      studentProfileId: document.studentProfileId,
      documentId: replacement.id,
      type: "DOCUMENT_REPLACEMENT_UPLOADED",
      title: "Replacement document uploaded",
      message: `${document.studentProfile.user.name ?? document.studentProfile.user.email} - ${title}`,
      note: document.returnedNote,
      link: `/dashboard/students/${payload.studentId}?tab=tasks`,
      actionRequired: true,
      metadata: { originalDocumentId: document.id, replacementDocumentId: replacement.id },
    });

    await prisma.activityLog.create({
      data: {
        actorId: payload.actorId!,
        targetStudentProfileId: document.studentProfileId,
        targetUserId: document.returnedById,
        entityType: "DOCUMENT",
        entityId: replacement.id,
        action: "Uploaded replacement document for returned file",
        metadata: { originalDocumentId: document.id, replacementDocumentId: replacement.id },
      },
    });

    revalidateContributionsCache(payload.studentId);
    revalidatePath(`/dashboard/students/${payload.studentId}`);
    revalidatePath("/dashboard/internal-staff");
    revalidatePath("/dashboard/sub-admin");
    revalidatePath("/dashboard/admin");
  } catch (error) {
    const existing = await prisma.studentDocument.findFirst({
      where: { OR: [{ storagePath }, { id: documentId }] },
      select: { id: true },
    });
    if (existing && isUniqueConstraintError(error)) return;

    await deleteStoredFile(storagePath).catch(() => undefined);
    throw error;
  }
}

function documentIdForStoragePath(storagePath: string) {
  return `doc_${createHash("sha256").update(storagePath).digest("hex").slice(0, 24)}`;
}

function isUniqueConstraintError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002",
  );
}

function uploadCallbackUrl() {
  const path = "/api/student-documents/upload";
  const vercelBase =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ||
    process.env.VERCEL_BRANCH_URL ||
    process.env.VERCEL_URL;

  if (vercelBase) {
    return new URL(path, `https://${vercelBase}`).toString();
  }

  const configuredBase =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.NEXTAUTH_URL?.trim();
  return configuredBase ? new URL(path, configuredBase).toString() : undefined;
}
