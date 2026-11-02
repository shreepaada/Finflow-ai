
import { describe, it, expect } from "vitest";

import { allocateTransactions } from "../src/matching/allocation-engine";

import type {
  Invoice,
  BankTransaction,
} from "../src/types/reconciliation";

function makeInvoice(
  id: string,
  vendorName: string,
  amount: number,
): Invoice {
  return {
    id,
    invoiceNumber: id,
    vendorName,
    amount,
    currency: "INR",
    invoiceDate: "2026-10-01",
    dueDate: "2026-10-30",
  };
}

function makeTransaction(
  id: string,
  description: string,
  amount: number,
  date = "2026-10-10",
): BankTransaction {
  return {
    id,
    description,
    amount,
    currency: "INR",
    transactionDate: date,
  };
}

describe("allocateTransactions", () => {
  it("allocates multiple partial payments to one invoice", () => {
    const invoice = makeInvoice("INV-001", "Amazon", 10000);

    const transactions = [
      makeTransaction("TXN-001", "AMAZON PAYMENT", 6000),
      makeTransaction("TXN-002", "AMAZON PAYMENT", 4000, "2026-10-11"),
    ];

    const result = allocateTransactions(
      [invoice],
      transactions,
    );

    expect(result.allocations).toHaveLength(2);
    expect(result.invoiceStatuses[0].status).toBe("PAID");
    expect(result.invoiceStatuses[0].paidAmount).toBe(10000);
    expect(result.exceptions).toHaveLength(0);
  });

  it("flags transactions when multiple invoices match", () => {
    const invoices = [
      makeInvoice("INV-001", "Amazon", 5000),
      makeInvoice("INV-002", "Amazon", 8000),
    ];

    const transaction = makeTransaction(
      "TXN-001",
      "AMAZON PAYMENT",
      5000,
    );

    const result = allocateTransactions(
      invoices,
      [transaction],
    );

    expect(result.allocations).toHaveLength(0);
    expect(result.exceptions[0].type).toBe("AMBIGUOUS");
    expect(result.exceptions[0].candidateInvoiceIds).toEqual([
      "INV-001",
      "INV-002",
    ]);
  });

  it("uses an invoice number to resolve ambiguity", () => {
    const invoices = [
      makeInvoice("INV-001", "Amazon", 5000),
      makeInvoice("INV-002", "Amazon", 8000),
    ];

    const transaction = makeTransaction(
      "TXN-001",
      "AMAZON INV-002 PAYMENT",
      4000,
    );

    const result = allocateTransactions(
      invoices,
      [transaction],
    );

    expect(result.allocations).toHaveLength(1);
    expect(result.allocations[0].invoiceId).toBe("INV-002");
    expect(result.invoiceStatuses[1].status).toBe(
      "PARTIALLY_PAID",
    );
  });

  it("flags transactions with no matching invoice", () => {
    const invoice = makeInvoice("INV-001", "Amazon", 5000);

    const transaction = makeTransaction(
      "TXN-001",
      "UNKNOWN MERCHANT",
      5000,
    );

    const result = allocateTransactions(
      [invoice],
      [transaction],
    );

    expect(result.allocations).toHaveLength(0);
    expect(result.exceptions[0].type).toBe("UNMATCHED");
  });

  it("rejects duplicate transaction IDs in the input", () => {
    const invoice = makeInvoice("INV-001", "Amazon", 10000);

    const transaction = makeTransaction(
      "TXN-001",
      "AMAZON PAYMENT",
      5000,
    );

    expect(() =>
      allocateTransactions(
        [invoice],
        [transaction, transaction],
      ),
    ).toThrow("Duplicate transaction ID");
  });
});
