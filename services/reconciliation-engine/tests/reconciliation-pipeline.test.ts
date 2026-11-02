
import { describe, it, expect } from "vitest";

import { reconcileInvoice } from "../src/matching/reconciliation";

import type {
  Invoice,
  BankTransaction,
} from "../src/types/reconciliation";

describe("reconcileInvoice", () => {
  const invoice: Invoice = {
    id: "INV-001",
    invoiceNumber: "INV-001",
    vendorName: "Amazon",
    amount: 5000,
    currency: "INR",
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-15",
  };

  it("returns an exact match when possible", () => {
    const transactions: BankTransaction[] = [
      {
        id: "TXN-001",
        description: "AMAZON PAYMENT",
        amount: 5000,
        currency: "INR",
        transactionDate: "2026-10-10",
      },
    ];

    const result = reconcileInvoice(invoice, transactions);

    expect(result.matchType).toBe("EXACT");
    expect(result.transactionId).toBe("TXN-001");
  });

  it("returns unmatched when no transaction exists", () => {
    const result = reconcileInvoice(invoice, []);

    expect(result.matchType).toBe("UNMATCHED");
    expect(result.confidence).toBe(0);
  });
});
