
import { describe, it, expect } from "vitest";
import { importBankCsv } from "../src/ingestion/csv-import";



describe("importBankCsv", () => {
  it("imports a single-amount CSV and identifies debit and credit directions", () => {
    const csv = `Date,Description,Amount,Currency,Reference
2026-10-10,"AMAZON, INDIA PAYMENT",-5000,INR,REF-001
2026-10-11,CLIENT PAYMENT,2500,INR,REF-002`;

    const result = importBankCsv(csv, {
      bankAccountId: "BANK-001",
      positiveAmountDirection: "CREDIT",
    });

    expect(result.importedCount).toBe(2);

    expect(result.transactions[0].amount).toBe(5000);
    expect(result.transactions[0].direction).toBe("DEBIT");
    expect(result.transactions[0].description)
      .toBe("AMAZON, INDIA PAYMENT");

    expect(result.transactions[1].amount).toBe(2500);
    expect(result.transactions[1].direction).toBe("CREDIT");
  });

  it("imports separate debit and credit columns", () => {
    const csv = `Transaction Date,Narration,Debit,Credit,UTR
10/10/2026,AMAZON PAYMENT,"5,000.00",,UTR-001
11/10/2026,CLIENT PAYMENT,,2500.00,UTR-002`;

    const result = importBankCsv(csv, {
      bankAccountId: "BANK-001",
      defaultCurrency: "INR",
      dateFormat: "DMY",
    });

    expect(result.importedCount).toBe(2);

    expect(result.transactions[0].amount).toBe(5000);
    expect(result.transactions[0].direction).toBe("DEBIT");

    expect(result.transactions[1].amount).toBe(2500);
    expect(result.transactions[1].direction).toBe("CREDIT");

    expect(result.transactions[0].currency).toBe("INR");
    expect(result.transactions[0].transactionDate)
      .toBe("2026-10-10");
  });

  it("rejects invalid dates and malformed amounts", () => {
    const csv = `Date,Description,Amount,Currency
31/02/2026,AMAZON PAYMENT,1000,INR
2026-10-10,FLIPKART PAYMENT,abc,INR`;

    const result = importBankCsv(csv, {
      bankAccountId: "BANK-001",
      positiveAmountDirection: "DEBIT",
    });

    expect(result.importedCount).toBe(0);
    expect(result.rejectedCount).toBe(2);

    expect(result.issues.map((issue) => issue.code))
      .toContain("INVALID_DATE");

    expect(result.issues.map((issue) => issue.code))
      .toContain("INVALID_AMOUNT");
  });

  it("requires an explicit sign convention for a single amount column", () => {
    const csv = `Date,Description,Amount,Currency
2026-10-10,AMAZON PAYMENT,5000,INR`;

    const result = importBankCsv(csv, {
      bankAccountId: "BANK-001",
    });

    expect(result.importedCount).toBe(0);

    expect(result.issues.some(
      (issue) =>
        issue.message.includes("positiveAmountDirection"),
    )).toBe(true);
  });
});
