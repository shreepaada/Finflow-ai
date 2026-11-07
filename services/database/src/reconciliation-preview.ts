import { prisma } from "./db.js";

import { findDuplicateCandidates } from "../../reconciliation-engine/src/matching/duplicate-detection.js";

import { allocateTransactions } from "../../reconciliation-engine/src/matching/allocation-engine.js";

import type {
  Invoice as EngineInvoice,
  BankTransaction as EngineTransaction,
} from "../../reconciliation-engine/src/types/reconciliation.js";

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function previewReconciliation(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
  });

  if (!workspace) {
    throw new Error("Workspace not found.");
  }

  const bankAccount = await prisma.bankAccount.findFirst({
    where: {
      workspaceId: workspace.id,
      bankName: "Demo Bank",
    },
  });

  if (!bankAccount) {
    throw new Error("Demo bank account not found.");
  }

  const [databaseInvoices, databaseTransactions] =
    await Promise.all([
      prisma.invoice.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: "asc" },
      }),

      prisma.bankTransaction.findMany({
        where: {
          workspaceId: workspace.id,
          bankAccountId: bankAccount.id,
        },
        orderBy: [
          { transactionDate: "asc" },
          { createdAt: "asc" },
        ],
      }),
    ]);

  const invoices: EngineInvoice[] = databaseInvoices.map(
    (invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      vendorName: invoice.vendorNameSnapshot,
      amount: invoice.amount.toNumber(),
      currency: invoice.currency,
      invoiceDate: dateOnly(invoice.issueDate),
      dueDate: invoice.dueDate
        ? dateOnly(invoice.dueDate)
        : "",
    }),
  );

  const transactions: EngineTransaction[] =
    databaseTransactions.map((transaction) => ({
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount.toNumber(),
      currency: transaction.currency,
      transactionDate: dateOnly(transaction.transactionDate),
      reference: transaction.externalReference ?? undefined,
      direction: transaction.direction,
    }));

  const duplicateCandidates = findDuplicateCandidates(
    transactions,
    bankAccount.id,
  );

  const duplicateIds = new Set(
    duplicateCandidates.map(
      (duplicate) => duplicate.duplicateTransactionId,
    ),
  );

  const eligibleDebitTransactions = transactions.filter(
    (transaction) =>
      transaction.direction === "DEBIT" &&
      !duplicateIds.has(transaction.id),
  );

  const allocation = allocateTransactions(
    invoices,
    eligibleDebitTransactions,
  );

  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
    },
    summary: {
      invoicesLoaded: invoices.length,
      transactionsLoaded: transactions.length,
      duplicateCandidates: duplicateCandidates.length,
      proposedAllocations: allocation.allocations.length,
      unresolvedExceptions: allocation.exceptions.length,
    },
    duplicateCandidates,
    allocations: allocation.allocations,
    invoiceStatuses: allocation.invoiceStatuses,
    exceptions: allocation.exceptions,
  };
}