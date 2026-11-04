
import type { Invoice } from "./types/reconciliation";

import {
  importBankCsv,
  type CsvImportOptions,
  type CsvImportResult,
  type ImportedBankTransaction,
} from "./ingestion/csv-import";

import {
  findDuplicateCandidates,
  type DuplicateCandidate,
} from "./matching/duplicate-detection";

import {
  allocateTransactions,
  type AllocationEngineResult,
} from "./matching/allocation-engine";

export interface BankStatementWorkflowResult {
  importResult: CsvImportResult;

  duplicateCandidates: DuplicateCandidate[];

  debitTransactions: ImportedBankTransaction[];
  creditTransactions: ImportedBankTransaction[];

  eligibleDebitTransactions: ImportedBankTransaction[];

  allocation: AllocationEngineResult;

  summary: {
    totalRows: number;
    importedRows: number;
    rejectedRows: number;
    debitCount: number;
    creditCount: number;
    duplicateCandidateCount: number;
    eligibleDebitCount: number;
    allocatedCount: number;
    unresolvedCount: number;
  };
}

export function processBankStatementCsv(
  csvText: string,
  invoices: Invoice[],
  options: CsvImportOptions,
): BankStatementWorkflowResult {
  // 1. Parse and validate the CSV.
  const importResult = importBankCsv(csvText, options);

  const transactions = importResult.transactions;

  // 2. Identify potential duplicates.
  const duplicateCandidates = findDuplicateCandidates(
    transactions,
    options.bankAccountId,
  );

  // Only the later occurrence is held for review.
  const duplicateIds = new Set(
    duplicateCandidates.map(
      (candidate) => candidate.duplicateTransactionId,
    ),
  );

  // 3. Separate outgoing and incoming transactions.
  const debitTransactions = transactions.filter(
    (transaction) => transaction.direction === "DEBIT",
  );

  const creditTransactions = transactions.filter(
    (transaction) => transaction.direction === "CREDIT",
  );

  // 4. Exclude potential duplicate rows from automatic allocation.
  // They remain in the import result for investigation.
  const eligibleDebitTransactions = debitTransactions.filter(
    (transaction) => !duplicateIds.has(transaction.id),
  );

  // 5. Reconcile only eligible outgoing payments.
  const allocation = allocateTransactions(
    invoices,
    eligibleDebitTransactions,
  );

  // 6. Return the results and an import summary.
  return {
    importResult,
    duplicateCandidates,
    debitTransactions,
    creditTransactions,
    eligibleDebitTransactions,
    allocation,

    summary: {
      totalRows: importResult.totalRows,
      importedRows: importResult.importedCount,
      rejectedRows: importResult.rejectedCount,
      debitCount: debitTransactions.length,
      creditCount: creditTransactions.length,
      duplicateCandidateCount: duplicateCandidates.length,
      eligibleDebitCount: eligibleDebitTransactions.length,
      allocatedCount: allocation.allocations.length,
      unresolvedCount: allocation.exceptions.length,
    },
  };
}
