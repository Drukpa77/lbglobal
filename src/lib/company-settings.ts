import { cache } from "react";

import { prisma } from "@/lib/prisma";

export type CompanySettings = {
  id: string;
  companyName: string;
  legalName: string | null;
  abn: string | null;
  addressLine: string | null;
  contactDetails: string | null;
  bankDetails: string | null;
  logoUrl: string | null;
  defaultCurrency: string;
  defaultTaxRate: number;
  defaultTaxLabel: string;
  paymentTerms: string | null;
  paymentRemarks: string | null;
  invoicePrefix: string;
  invoiceFooter: string | null;
};

const DEFAULTS: Omit<CompanySettings, "id"> = {
  companyName: "L&B Global",
  legalName: null,
  abn: null,
  addressLine: null,
  contactDetails: null,
  bankDetails: null,
  logoUrl: null,
  defaultCurrency: "AUD",
  defaultTaxRate: 10,
  defaultTaxLabel: "GST",
  paymentTerms: null,
  paymentRemarks: null,
  invoicePrefix: "INV-",
  invoiceFooter: null,
};

function shape(row: {
  id: string;
  companyName: string;
  legalName: string | null;
  abn: string | null;
  addressLine: string | null;
  contactDetails: string | null;
  bankDetails: string | null;
  logoUrl: string | null;
  defaultCurrency: string;
  defaultTaxRate: number;
  defaultTaxLabel: string;
  paymentTerms: string | null;
  paymentRemarks: string | null;
  invoicePrefix: string;
  invoiceFooter: string | null;
}): CompanySettings {
  return {
    id: row.id,
    companyName: row.companyName,
    legalName: row.legalName,
    abn: row.abn,
    addressLine: row.addressLine,
    contactDetails: row.contactDetails,
    bankDetails: row.bankDetails,
    logoUrl: row.logoUrl,
    defaultCurrency: row.defaultCurrency,
    defaultTaxRate: row.defaultTaxRate,
    defaultTaxLabel: row.defaultTaxLabel,
    paymentTerms: row.paymentTerms,
    paymentRemarks: row.paymentRemarks,
    invoicePrefix: row.invoicePrefix,
    invoiceFooter: row.invoiceFooter,
  };
}

export const getCompanySettings = cache(async (): Promise<CompanySettings> => {
  const existing = await prisma.companySettings.findFirst({
    where: { singleton: true },
  });
  if (existing) return shape(existing);
  const created = await prisma.companySettings.create({
    data: { singleton: true, ...DEFAULTS },
  });
  return shape(created);
});

export async function updateCompanySettings(input: Omit<CompanySettings, "id">) {
  const existing = await prisma.companySettings.findFirst({
    where: { singleton: true },
    select: { id: true },
  });
  if (existing) {
    await prisma.companySettings.update({
      where: { id: existing.id },
      data: { ...input, singleton: true },
    });
    return;
  }
  await prisma.companySettings.create({
    data: { singleton: true, ...input },
  });
}
