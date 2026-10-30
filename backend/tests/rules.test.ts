import { describe, expect, it } from "vitest";
import { calculateInvoice, deriveInvoiceState, toMinor } from "../src/lib/money";
import { assertStatusTransition } from "../src/lib/schedule";

describe("invoice arithmetic", () => {
  it("calculates discount and tax in minor units", () => {
    const invoice = calculateInvoice({
      lines: [
        { description: "Consultation", quantity: 1, unitPrice: "500.00" },
        { description: "Registration", quantity: 2, unitPrice: "50.00" },
      ],
      discount: "50.00",
      taxRatePercent: 5,
    });
    expect(invoice.subtotal.toFixed(2)).toBe("600.00");
    expect(invoice.discount.toFixed(2)).toBe("50.00");
    expect(invoice.tax.toFixed(2)).toBe("27.50");
    expect(invoice.total.toFixed(2)).toBe("577.50");
    expect(toMinor(invoice.total)).toBe(57750);
  });

  it("rejects a discount above the subtotal", () => {
    expect(() =>
      calculateInvoice({
        lines: [{ description: "Consultation", quantity: 1, unitPrice: "100.00" }],
        discount: "100.01",
        taxRatePercent: 0,
      }),
    ).toThrow(/Discount/);
  });

  it("derives partial, paid, and refunded balances", () => {
    expect(deriveInvoiceState({ totalMinor: 55000, paidMinor: 20000, refundedMinor: 0, voided: false })).toEqual({
      balanceMinor: 35000,
      status: "PARTIALLY_PAID",
    });
    expect(deriveInvoiceState({ totalMinor: 55000, paidMinor: 55000, refundedMinor: 0, voided: false }).status).toBe("PAID");
    expect(deriveInvoiceState({ totalMinor: 55000, paidMinor: 55000, refundedMinor: 55000, voided: false }).status).toBe(
      "REFUNDED",
    );
  });
});

describe("appointment transitions", () => {
  it("allows check-in from confirmed and rejects completion from scheduled", () => {
    expect(() => assertStatusTransition("CONFIRMED", "CHECKED_IN")).not.toThrow();
    expect(() => assertStatusTransition("SCHEDULED", "COMPLETED")).toThrow(/Cannot change status/);
  });
});
