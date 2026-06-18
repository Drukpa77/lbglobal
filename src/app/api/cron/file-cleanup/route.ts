import { NextResponse } from "next/server";

import { processStoredFileCleanupQueue } from "@/lib/stored-file-cleanup";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction && !cronSecret) {
    return NextResponse.json({ error: "Cron secret is not configured." }, { status: 500 });
  }

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processStoredFileCleanupQueue();

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
