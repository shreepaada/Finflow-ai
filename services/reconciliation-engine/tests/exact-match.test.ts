
import { describe, it, expect } from "vitest";

import type {
  Invoice,
  BankTransaction,
} from "../src/types/reconciliation";
import { findExactMatch } from "../src/matching/exact-match";

describe("findExactMatch", () => {
  const invoice: Invoice = {
    id: "INV-001",
    invoiceNumber: "INV-001",
    vendorName: "Amazon",
    amount: 5000,
    currency: "INR",
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-15",
  };

  const transactions: BankTransaction[] = [
    {
      id: "TXN-001",
      description: "AMAZON PAYMENT",
      amount: 5000,
      currency: "INR",
      transactionDate: "2026-10-10",
    },
  ];

  it("matches transactions with the same amount and currency", () => {
    expect(findExactMatch(invoice, transactions)?.id)
      .toBe("TXN-001");
  });

  it("returns undefined when no matching transaction exists", () => {
    expect(findExactMatch(invoice, [])).toBeUndefined();
  });
  
it("does not match transactions from a different vendor", () => {
  const wrongVendorTransaction: BankTransaction = {
    id: "TXN-002",
    description: "FLIPKART PAYMENT",
    amount: 5000,
    currency: "INR",
    transactionDate: "2026-10-10",
  };

  expect(
    findExactMatch(invoice, [wrongVendorTransaction]),
  ).toBeUndefined();
});

});
