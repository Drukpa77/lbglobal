export type InvoiceItemInput = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export function normalizeInvoiceItems(items: InvoiceItemInput[]) {
  return items
    .map((item) => {
      const quantity = Number.isFinite(item.quantity) ? Math.max(1, Math.trunc(item.quantity)) : 1;
      const unitPrice = Number.isFinite(item.unitPrice) ? Math.max(0, item.unitPrice) : 0;
      return {
        description: item.description.trim() || "Service",
        quantity,
        unitPrice,
        amount: round2(quantity * unitPrice),
      };
    })
    .filter((item) => item.description.length > 0);
}

export function calculateInvoiceTotals(items: Array<{ amount: number }>, taxRatePercent: number) {
  const subtotal = round2(items.reduce((sum, item) => sum + item.amount, 0));
  const safeTaxRate = Number.isFinite(taxRatePercent) ? Math.max(0, taxRatePercent) : 0;
  const taxAmount = round2(subtotal * (safeTaxRate / 100));
  const totalAmount = round2(subtotal + taxAmount);
  return { subtotal, taxAmount, totalAmount };
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
