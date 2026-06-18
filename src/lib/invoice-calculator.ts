export type InvoiceItemInput = {
  description: string;
  quantity: number;
  unitPrice: number;
  taxable?: boolean;
};

export type InvoiceLineTotalsInput = {
  quantity: number;
  unitPrice: number;
  taxable: boolean;
};

export function roundInvoiceAmount(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizeInvoiceQuantity(raw: number) {
  return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

export function normalizeInvoiceItems(items: InvoiceItemInput[]) {
  return items
    .map((item) => {
      const quantity = normalizeInvoiceQuantity(item.quantity);
      const unitPrice = Number.isFinite(item.unitPrice) ? Math.max(0, item.unitPrice) : 0;
      return {
        description: item.description.trim() || "Service",
        quantity,
        unitPrice,
        amount: roundInvoiceAmount(quantity * unitPrice),
        taxable: item.taxable ?? true,
      };
    })
    .filter((item) => item.description.length > 0);
}

export function calculateInvoiceTotals(
  items: InvoiceLineTotalsInput[],
  discountAmount: number,
  taxRatePercent: number,
  shippingAmount: number,
) {
  const subtotal = roundInvoiceAmount(
    items.reduce((sum, item) => sum + normalizeInvoiceQuantity(item.quantity) * Math.max(0, item.unitPrice || 0), 0),
  );
  const taxableSubtotal = roundInvoiceAmount(
    items.reduce(
      (sum, item) =>
        item.taxable
          ? sum + normalizeInvoiceQuantity(item.quantity) * Math.max(0, item.unitPrice || 0)
          : sum,
      0,
    ),
  );
  const discount = roundInvoiceAmount(Math.max(0, discountAmount || 0));
  const subtotalAfterDiscount = roundInvoiceAmount(Math.max(0, subtotal - discount));
  const safeTaxRate = Number.isFinite(taxRatePercent) ? Math.max(0, taxRatePercent) : 0;
  const taxAmount = roundInvoiceAmount(taxableSubtotal * (safeTaxRate / 100));
  const shipping = roundInvoiceAmount(Math.max(0, shippingAmount || 0));
  const totalAmount = roundInvoiceAmount(subtotalAfterDiscount + taxAmount + shipping);

  return {
    subtotal,
    discount,
    subtotalAfterDiscount,
    taxAmount,
    shipping,
    totalAmount,
  };
}
