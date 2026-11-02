
import { describe, it, expect } from "vitest";



import type {
  Invoice,
  BankTransaction,
} from "../src/types/reconciliation";
import { findFuzzyMatch } from "../src/matching/fuzzy-match";

describe("findFuzzyMatch", () => {
  const invoice: Invoice = {
    id: "INV-001",
    invoiceNumber: "INV-001",
    vendorName: "Amazon",
    amount: 5000,
    currency: "INR",
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-15",
  };

  it("finds a transaction with a similar vendor description", () => {
    const transactions: BankTransaction[] = [
      {
        id: "TXN-001",
        description: "Amazon payment",
        amount: 5000,
        currency: "INR",
        transactionDate: "2026-10-10",
      },
    ];

    const result = findFuzzyMatch(invoice, transactions);

    expect(result?.transaction.id).toBe("TXN-001");
  });

  it("returns undefined when no candidate meets the threshold", () => {
    const transactions: BankTransaction[] = [
      {
        id: "TXN-002",
        description: "Unrelated merchant",
        amount: 5000,
        currency: "INR",
        transactionDate: "2026-10-10",
      },
    ];

    expect(findFuzzyMatch(invoice, transactions)).toBeUndefined();
  });
});
