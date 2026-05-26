import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

const partySchema = z.object({
  name: z.string().trim().max(200).nullable().optional(),
  company: z.string().trim().max(200).nullable().optional(),
  address: z.string().trim().max(1000).nullable().optional(),
  phone: z.string().trim().max(100).nullable().optional(),
  email: z.string().trim().max(200).nullable().optional(),
});

const updateSchema = z.object({
  invoiceId: z.string().min(1),
  subject: z.string().trim().min(1).max(255),
  currency: z.string().trim().min(1).max(8),
  dueDate: z.string().nullable().optional(),
  paymentTerms: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  customerLabel: z.string().nullable().optional(),
  discountAmount: z.number().nonnegative(),
  taxRate: z.number().nonnegative(),
  shippingAmount: z.number().nonnegative(),
  companyName: z.string().trim().min(1).max(200),
  legalName: z.string().nullable().optional(),
  abn: z.string().nullable().optional(),
  companyAddress: z.string().nullable().optional(),
  companyContact: z.string().nullable().optional(),
  bankDetails: z.string().nullable().optional(),
  billTo: partySchema,
  shipTo: partySchema.nullable().optional(),
  lineItems: z
    .array(
      z.object({
        description: z.string().trim().min(1).max(2000),
        quantity: z.number().nonnegative(),
        unitPrice: z.number().nonnegative(),
        taxable: z.boolean(),
      }),
    )
    .min(1),
  previewHtml: z.string().optional(),
});

type Params = Promise<{ invoiceId: string }>;

export async function PATCH(request: Request, { params }: { params: Params }) {
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

  const { invoiceId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  if (parsed.data.invoiceId !== invoiceId) {
    return NextResponse.json({ error: "Invoice mismatch" }, { status: 400 });
  }

  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      status: true,
      studentProfileId: true,
      studentProfile: { select: { userId: true } },
    },
  });
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (invoice.status !== "DRAFT") {
    return NextResponse.json({ error: "Only DRAFT invoices can be edited." }, { status: 409 });
  }

  const totals = calculateTotals(
    parsed.data.lineItems,
    parsed.data.discountAmount,
    parsed.data.taxRate,
    parsed.data.shippingAmount,
  );

  const dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;

  await prisma.$transaction(async (tx) => {
    await tx.invoiceLineItem.deleteMany({ where: { invoiceId } });
    await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        subject: parsed.data.subject,
        title: parsed.data.customerLabel ?? parsed.data.subject,
        currency: parsed.data.currency.toUpperCase(),
        dueDate: dueDate && !Number.isNaN(dueDate.getTime()) ? dueDate : null,
        paymentTerms: parsed.data.paymentTerms ?? null,
        remarks: parsed.data.remarks ?? null,
        discountAmount: totals.discount,
        taxRate: parsed.data.taxRate,
        taxAmount: totals.taxAmount,
        shippingAmount: totals.shipping,
        subtotal: totals.subtotal,
        totalAmount: totals.balanceDue,
        companyName: parsed.data.companyName,
        companyAddress: parsed.data.companyAddress ?? null,
        companyContact: [parsed.data.companyContact, parsed.data.bankDetails]
          .filter((line) => line && line.trim().length > 0)
          .join("\n\n") || null,
        billToName: parsed.data.billTo?.name ?? null,
        billToCompany: parsed.data.billTo?.company ?? null,
        billToAddress: parsed.data.billTo?.address ?? null,
        billToPhone: parsed.data.billTo?.phone ?? null,
        billToEmail: parsed.data.billTo?.email ?? null,
        shipToName: parsed.data.shipTo?.name ?? null,
        shipToCompany: parsed.data.shipTo?.company ?? null,
        shipToAddress: parsed.data.shipTo?.address ?? null,
        shipToPhone: parsed.data.shipTo?.phone ?? null,
        shipToEmail: parsed.data.shipTo?.email ?? null,
        htmlSnapshot: parsed.data.previewHtml?.slice(0, 200_000) ?? "",
        lineItems: {
          create: parsed.data.lineItems.map((item) => ({
            description: item.description,
            quantity: round2(item.quantity),
            unitPrice: round2(item.unitPrice),
            amount: round2(item.quantity * item.unitPrice),
            taxable: item.taxable,
          })),
        },
      },
    });
  });

  await prisma.activityLog.create({
    data: {
      actorId: session.user.id,
      targetStudentProfileId: invoice.studentProfileId,
      entityType: "INVOICE",
      entityId: invoiceId,
      action: "Updated invoice from builder",
    },
  });

  revalidatePath(`/dashboard/invoices/${invoiceId}/preview`);
  if (invoice.studentProfile?.userId) {
    revalidatePath(`/dashboard/students/${invoice.studentProfile.userId}`);
  }

  return NextResponse.json({ ok: true });
}

function calculateTotals(
  items: Array<{ quantity: number; unitPrice: number; taxable: boolean }>,
  discount: number,
  taxRate: number,
  shipping: number,
) {
  const subtotal = round2(
    items.reduce((sum, item) => sum + (item.quantity || 0) * (item.unitPrice || 0), 0),
  );
  const taxableSubtotal = round2(
    items.reduce(
      (sum, item) => (item.taxable ? sum + (item.quantity || 0) * (item.unitPrice || 0) : sum),
      0,
    ),
  );
  const discountAmount = round2(Math.max(0, discount || 0));
  const subtotalAfterDiscount = round2(Math.max(0, subtotal - discountAmount));
  const taxAmount = round2(taxableSubtotal * (Math.max(0, taxRate || 0) / 100));
  const shippingAmount = round2(Math.max(0, shipping || 0));
  const balanceDue = round2(subtotalAfterDiscount + taxAmount + shippingAmount);
  return { subtotal, discount: discountAmount, subtotalAfterDiscount, taxAmount, shipping: shippingAmount, balanceDue };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
