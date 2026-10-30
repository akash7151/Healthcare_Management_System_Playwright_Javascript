import { Prisma } from "@prisma/client";

export function toMinor(value: Prisma.Decimal | string | number): number {
  const fixed = new Prisma.Decimal(value).toFixed(2);
  const negative = fixed.startsWith("-");
  const [whole, frac] = fixed.replace("-", "").split(".");
  const minor = Number(whole) * 100 + Number(frac);
  if (!Number.isSafeInteger(minor)) {
    throw new Error("Amount is out of range");
  }
  return negative ? -minor : minor;
}

export function fromMinor(minor: number): Prisma.Decimal {
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return new Prisma.Decimal(`${negative ? "-" : ""}${whole}.${frac}`);
}

export function moneyString(value: Prisma.Decimal | string | number): string {
  return new Prisma.Decimal(value).toFixed(2);
}

export type InvoiceLineInput = {
  description: string;
  quantity: number;
  unitPrice: string;
};

export type CalculatedInvoice = {
  lines: Array<{
    description: string;
    quantity: number;
    unitPrice: Prisma.Decimal;
    amount: Prisma.Decimal;
  }>;
  subtotal: Prisma.Decimal;
  discount: Prisma.Decimal;
  tax: Prisma.Decimal;
  total: Prisma.Decimal;
  balance: Prisma.Decimal;
};

export function calculateInvoice(input: {
  lines: InvoiceLineInput[];
  discount: string;
  taxRatePercent: number;
}): CalculatedInvoice {
  if (input.lines.length === 0) {
    throw new Error("Invoice needs at least one line");
  }
  let subtotal = 0;
  const lines = input.lines.map((line) => {
    if (!Number.isInteger(line.quantity) || line.quantity < 1) {
      throw new Error("Line quantity must be a positive integer");
    }
    if (!line.description.trim()) {
      throw new Error("Line description is required");
    }
    const unit = toMinor(line.unitPrice);
    if (unit < 0) {
      throw new Error("Unit price cannot be negative");
    }
    const amount = unit * line.quantity;
    subtotal += amount;
    return {
      description: line.description.trim(),
      quantity: line.quantity,
      unitPrice: fromMinor(unit),
      amount: fromMinor(amount),
    };
  });
  const discount = toMinor(input.discount || "0");
  if (discount < 0) {
    throw new Error("Discount cannot be negative");
  }
  if (discount > subtotal) {
    throw new Error("Discount cannot exceed the subtotal");
  }
  if (!Number.isFinite(input.taxRatePercent) || input.taxRatePercent < 0 || input.taxRatePercent > 28) {
    throw new Error("Tax rate must be between 0 and 28");
  }
  const taxable = subtotal - discount;
  const tax = Math.round((taxable * input.taxRatePercent) / 100);
  const total = taxable + tax;
  return {
    lines,
    subtotal: fromMinor(subtotal),
    discount: fromMinor(discount),
    tax: fromMinor(tax),
    total: fromMinor(total),
    balance: fromMinor(total),
  };
}

export function deriveInvoiceState(input: {
  totalMinor: number;
  paidMinor: number;
  refundedMinor: number;
  voided: boolean;
}): { balanceMinor: number; status: "VOID" | "REFUNDED" | "PAID" | "PARTIALLY_PAID" | "ISSUED" } {
  if (input.voided) {
    return { balanceMinor: 0, status: "VOID" };
  }
  const netPaid = input.paidMinor - input.refundedMinor;
  const balanceMinor = input.totalMinor - netPaid;
  if (input.refundedMinor > 0 && netPaid === 0) {
    return { balanceMinor, status: "REFUNDED" };
  }
  if (balanceMinor <= 0) {
    return { balanceMinor: 0, status: "PAID" };
  }
  if (netPaid > 0) {
    return { balanceMinor, status: "PARTIALLY_PAID" };
  }
  return { balanceMinor, status: "ISSUED" };
}
