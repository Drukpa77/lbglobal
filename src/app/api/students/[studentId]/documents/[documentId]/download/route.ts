import { NextResponse } from "next/server";

import { auth } from "@/auth";
import {
  getStudentDocumentForStaff,
  streamStudentDocument,
} from "@/lib/student-document-delivery";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ studentId: string; documentId: string }> },
) {
  const { studentId, documentId } = await context.params;
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await getStudentDocumentForStaff({
    user: session.user,
    studentId,
    documentId,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return streamStudentDocument(result.document, "attachment");
}
