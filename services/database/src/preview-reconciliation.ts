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

async function main() {
  // 1. Find our demo workspace.
  const workspace = await prisma.workspace.findUnique({
    where: { slug: "demo-freelance" },
  });

  if (!workspace) {
    throw new Error("Demo workspace not found.");
  }

  // 2. Find its bank account.
  const bankAccount = await prisma.bankAccount.findFirst({
    where: {
      workspaceId: workspace.id,
      bankName: "Demo Bank",
    },
  });

  if (!bankAccount) {
    throw new Error("Demo bank account not found.");
  }

  // 3. Retrieve invoices and bank transactions.
  const [databaseInvoices, databaseTransactions] = await Promise.all([
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

  // 4. Convert database invoices into engine inputs.
  const invoices: EngineInvoice[] = databaseInvoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    vendorName: invoice.vendorNameSnapshot,
    amount: invoice.amount.toNumber(),
    currency: invoice.currency,
    invoiceDate: dateOnly(invoice.issueDate),
    dueDate: invoice.dueDate
      ? dateOnly(invoice.dueDate)
      : "",
  }));

  // 5. Convert database transactions into engine inputs.
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

  // 6. Detect duplicate transactions.
  const duplicateCandidates = findDuplicateCandidates(
    transactions,
    bankAccount.id,
  );

  const duplicateIds = new Set(
    duplicateCandidates.map(
      (duplicate) => duplicate.duplicateTransactionId,
    ),
  );

  // 7. Reconcile eligible debit transactions.
  const eligibleDebitTransactions = transactions.filter(
    (transaction) =>
      transaction.direction === "DEBIT" &&
      !duplicateIds.has(transaction.id),
  );

  const allocation = allocateTransactions(
    invoices,
    eligibleDebitTransactions,
  );

  // 8. Display results.
  console.log("\n========== FINFLOW AI PREVIEW ==========");

  console.log("\nWorkspace:", workspace.name);

  console.log("\nInvoices loaded:", invoices.length);

  console.log("Bank transactions loaded:", transactions.length);

  console.log("\nDuplicate candidates:");
  console.dir(duplicateCandidates, { depth: null });

  console.log("\nProposed payment allocations:");
  console.dir(allocation.allocations, { depth: null });

  console.log("\nInvoice payment statuses:");
  console.dir(allocation.invoiceStatuses, { depth: null });

  console.log("\nUnresolved exceptions:");
  console.dir(allocation.exceptions, { depth: null });

  console.log("\n========================================");
}

main()
  .catch((error) => {
    console.error("Reconciliation preview failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });