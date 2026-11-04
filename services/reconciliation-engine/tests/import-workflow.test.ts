
import { describe, it, expect } from "vitest";

import { processBankStatementCsv } from "../src/import-workflow";

import type { Invoice } from "../src/types/reconciliation";

describe("processBankStatementCsv", () => {
  const invoices: Invoice[] = [
    {
      id: "INV-001",
      invoiceNumber: "INV-001",
      vendorName: "Amazon",
      amount: 5000,
      currency: "INR",
      invoiceDate: "2026-10-01",
      dueDate: "2026-10-30",
    },
  ];

  it("imports, detects duplicates, separates credits and reconciles debits", () => {
    const csv = `Date,Description,Amount,Currency,Reference
2026-10-10,AMAZON INV-001 PAYMENT,-5000,INR,REF-001
2026-10-10,AMAZON INV-001 PAYMENT,-5000,INR,REF-001
2026-10-10,CLIENT PAYMENT,2000,INR,REF-002`;

    const result = processBankStatementCsv(
      csv,
      invoices,
      {
        bankAccountId: "BANK-001",
        positiveAmountDirection: "CREDIT",
      },
    );

    expect(result.importResult.importedCount).toBe(3);

    expect(result.debitTransactions).toHaveLength(2);
    expect(result.creditTransactions).toHaveLength(1);

    expect(result.duplicateCandidates).toHaveLength(1);

    expect(result.eligibleDebitTransactions).toHaveLength(1);

    expect(result.allocation.allocations).toHaveLength(1);

    expect(result.allocation.invoiceStatuses[0].status)
      .toBe("PAID");

    expect(result.summary.duplicateCandidateCount).toBe(1);
    expect(result.summary.allocatedCount).toBe(1);
  });

  it("never allocates an incoming credit to a vendor invoice", () => {
    const csv = `Date,Description,Amount,Currency,Reference
2026-10-10,CLIENT PAYMENT,5000,INR,REF-100`;

    const result = processBankStatementCsv(
      csv,
      invoices,
      {
        bankAccountId: "BANK-001",
        positiveAmountDirection: "CREDIT",
      },
    );

    expect(result.creditTransactions).toHaveLength(1);
    expect(result.eligibleDebitTransactions).toHaveLength(0);
    expect(result.allocation.allocations).toHaveLength(0);

    expect(result.allocation.invoiceStatuses[0].status)
      .toBe("UNPAID");
  });
});
