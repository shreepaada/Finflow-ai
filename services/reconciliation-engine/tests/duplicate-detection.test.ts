
import { describe, it, expect } from "vitest";

import { findDuplicateCandidates } from "../src/matching/duplicate-detection";

import type { BankTransaction } from "../src/types/reconciliation";

describe("findDuplicateCandidates", () => {
  const bankAccountId = "BANK-ACCOUNT-001";

  it("detects duplicate transactions using bank references", () => {
    const transactions: BankTransaction[] = [
      {
        id: "TXN-001",
        description: "Amazon Payment",
        amount: 5000,
        currency: "INR",
        transactionDate: "2026-10-10",
        reference: "REF123",
      },
      {
        id: "TXN-002",
        description: "Amazon Payment",
        amount: 5000,
        currency: "INR",
        transactionDate: "2026-10-11",
        reference: "REF123",
      },
    ];

    const result = findDuplicateCandidates(
      transactions,
      bankAccountId,
    );

    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("BANK_REFERENCE");
    expect(result[0].duplicateTransactionId).toBe("TXN-002");
  });

  it("detects potential duplicates using transaction fingerprints", () => {
    const transactions: BankTransaction[] = [
      {
        id: "TXN-001",
        description: "AMAZON PAYMENT",
        amount: 5000,
        currency: "INR",
        transactionDate: "2026-10-10",
      },
      {
        id: "TXN-002",
        description: "Amazon-Payment",
        amount: 5000,
        currency: "INR",
        transactionDate: "2026-10-10",
      },
    ];

    const result = findDuplicateCandidates(
      transactions,
      bankAccountId,
    );

    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("TRANSACTION_FINGERPRINT");
  });

  it("does not flag transactions with different references", () => {
    const transactions: BankTransaction[] = [
      {
        id: "TXN-001",
        description: "Amazon Payment",
        amount: 5000,
        currency: "INR",
        transactionDate: "2026-10-10",
        reference: "REF001",
      },
      {
        id: "TXN-002",
        description: "Amazon Payment",
        amount: 5000,
        currency: "INR",
        transactionDate: "2026-10-10",
        reference: "REF002",
      },
    ];

    expect(
      findDuplicateCandidates(transactions, bankAccountId),
    ).toHaveLength(0);
  });

  it("requires a bank account ID", () => {
    expect(() =>
      findDuplicateCandidates([], ""),
    ).toThrow("Bank account ID is required.");
  });
});
