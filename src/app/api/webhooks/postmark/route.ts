import { type Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";

type PostmarkWebhookPayload = {
  RecordType?: string;
  MessageID?: string;
  DeliveredAt?: string;
  BouncedAt?: string;
  ReceivedAt?: string;
  Details?: string;
  Description?: string;
};

export async function POST(request: Request) {
  const secret = process.env.POSTMARK_WEBHOOK_SECRET?.trim();
  if (!secret && process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Postmark webhook secret is not configured." }, { status: 500 });
  }

  if (secret && !hasValidSecret(request, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: PostmarkWebhookPayload;
  try {
    payload = (await request.json()) as PostmarkWebhookPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messageId = payload.MessageID?.trim();
  const recordType = payload.RecordType?.trim();

  if (!messageId || !recordType) {
    return NextResponse.json({ error: "Missing MessageID or RecordType." }, { status: 400 });
  }

  const eventAt = parseDate(payload.DeliveredAt ?? payload.BouncedAt ?? payload.ReceivedAt) ?? new Date();
  const data: Prisma.OutboundEmailLogUpdateInput = {
    lastProviderEvent: recordType,
    lastProviderEventAt: eventAt,
    providerEventData: payload as Prisma.InputJsonValue,
  };

  if (recordType === "Delivery") {
    data.deliveredAt = parseDate(payload.DeliveredAt) ?? eventAt;
  }

  if (recordType === "Bounce" || recordType === "SpamComplaint") {
    data.status = "FAILED";
    data.bouncedAt = parseDate(payload.BouncedAt ?? payload.ReceivedAt) ?? eventAt;
    data.errorMessage = normalizeErrorMessage(payload.Description ?? payload.Details ?? recordType);
  }

  const updated = await prisma.outboundEmailLog.updateMany({
    where: {
      provider: "POSTMARK",
      providerMessageId: messageId,
    },
    data,
  });

  return NextResponse.json({ ok: true, matched: updated.count });
}

function hasValidSecret(request: Request, secret: string) {
  const url = new URL(request.url);
  const querySecret = url.searchParams.get("secret");
  if (querySecret === secret) return true;

  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${secret}`) return true;

  return request.headers.get("x-postmark-webhook-secret") === secret;
}

function parseDate(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeErrorMessage(message: string) {
  return message.slice(0, 4000);
}
