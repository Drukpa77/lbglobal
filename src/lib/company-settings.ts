import { cache } from "react";

import { prisma } from "@/lib/prisma";

export type CompanySettings = {
  id: string;
  companyName: string;
  addressLine: string | null;
  contactDetails: string | null;
  logoUrl: string | null;
  defaultCurrency: string;
  paymentTerms: string | null;
  paymentRemarks: string | null;
  invoicePrefix: string;
};

const DEFAULTS: Omit<CompanySettings, "id"> = {
  companyName: "L&B Global",
  addressLine: null,
  contactDetails: null,
  logoUrl: null,
  defaultCurrency: "AUD",
  paymentTerms: null,
  paymentRemarks: null,
  invoicePrefix: "INV-",
};

export const getCompanySettings = cache(async (): Promise<CompanySettings> => {
  const existing = await prisma.companySettings.findFirst({
    where: { singleton: true },
  });
  if (existing) {
    return {
      id: existing.id,
      companyName: existing.companyName,
      addressLine: existing.addressLine,
      contactDetails: existing.contactDetails,
      logoUrl: existing.logoUrl,
      defaultCurrency: existing.defaultCurrency,
      paymentTerms: existing.paymentTerms,
      paymentRemarks: existing.paymentRemarks,
      invoicePrefix: existing.invoicePrefix,
    };
  }
  const created = await prisma.companySettings.create({
    data: { singleton: true, ...DEFAULTS },
  });
  return {
    id: created.id,
    companyName: created.companyName,
    addressLine: created.addressLine,
    contactDetails: created.contactDetails,
    logoUrl: created.logoUrl,
    defaultCurrency: created.defaultCurrency,
    paymentTerms: created.paymentTerms,
    paymentRemarks: created.paymentRemarks,
    invoicePrefix: created.invoicePrefix,
  };
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
