
import { describe, it, expect } from "vitest";

import { calculatePaymentStatus } from "../src/matching/payment-status";

import type {
  Invoice,
  PaymentAllocation,
} from "../src/types/reconciliation";

describe("calculatePaymentStatus", () => {
  const CURRENCY = "INR";

  const invoice: Invoice = {
    id: "INV-001",
    invoiceNumber: "INV-001",
    vendorName: "Amazon",
    amount: 10000,
    currency: CURRENCY,
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-15",
  };

  const payment = (
    transactionId: string,
    amount: number,
    currency = CURRENCY,
  ): PaymentAllocation => ({
    invoiceId: invoice.id,
    transactionId,
    amount,
    currency,
  });

  it("identifies an unpaid invoice", () => {
    expect(calculatePaymentStatus(invoice, []).status)
      .toBe("UNPAID");
  });

  it("identifies a partially paid invoice", () => {
    const result = calculatePaymentStatus(invoice, [
      payment("TXN-001", 6000),
    ]);

    expect(result.status).toBe("PARTIALLY_PAID");
    expect(result.outstandingAmount).toBe(4000);
  });

  it("identifies a fully paid invoice", () => {
    const result = calculatePaymentStatus(invoice, [
      payment("TXN-001", 6000),
      payment("TXN-002", 4000),
    ]);

    expect(result.status).toBe("PAID");
    expect(result.outstandingAmount).toBe(0);
  });

  it("identifies an overpaid invoice", () => {
    const result = calculatePaymentStatus(invoice, [
      payment("TXN-001", 12000),
    ]);

    expect(result.status).toBe("OVERPAID");
    expect(result.outstandingAmount).toBe(-2000);
  });

  it("rejects duplicate transaction allocations", () => {
    expect(() =>
      calculatePaymentStatus(invoice, [
        payment("TXN-001", 6000),
        payment("TXN-001", 4000),
      ]),
    ).toThrow("Duplicate transaction allocation");
  });

  it("rejects payments in a different currency", () => {
    expect(() =>
      calculatePaymentStatus(invoice, [
        payment("TXN-001", 6000, "USD"),
      ]),
    ).toThrow("Payment currency does not match invoice currency");
  });
});
