import { prisma } from "./db.js";

import {
  findDuplicateCandidates,
} from "../../reconciliation-engine/src/matching/duplicate-detection.js";

import {
  allocateTransactions,
} from "../../reconciliation-engine/src/matching/allocation-engine.js";

import type {
  Invoice as EngineInvoice,
  BankTransaction as EngineTransaction,
} from "../../reconciliation-engine/src/types/reconciliation.js";

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function main() {
  // 1. Retrieve the workspace.
  const workspace = await prisma.workspace.findUnique({
    where: { slug: "demo-freelance" },
  });

  if (!workspace) {
    throw new Error("Demo workspace not found.");
  }

  // 2. Retrieve the bank account.
  const bankAccount = await prisma.bankAccount.findFirst({
    where: {
      workspaceId: workspace.id,
      bankName: "Demo Bank",
    },
  });

  if (!bankAccount) {
    throw new Error("Demo bank account not found.");
  }

  // 3. Retrieve invoices and transactions.
  const [databaseInvoices, databaseTransactions] = await Promise.all([
    prisma.invoice.findMany({
      where: { workspaceId: workspace.id },
    }),

    prisma.bankTransaction.findMany({
      where: {
        workspaceId: workspace.id,
        bankAccountId: bankAccount.id,
      },
    }),
  ]);

  // 4. Convert Prisma invoices into engine inputs.
  const invoices: EngineInvoice[] = databaseInvoices.map((invoice) => ({
    id: invoice.id,
    invoiceNumber: invoice.invoiceNumber,
    vendorName: invoice.vendorNameSnapshot,
    amount: invoice.amount.toNumber(),
    currency: invoice.currency,
    invoiceDate: dateOnly(invoice.issueDate),
    dueDate: invoice.dueDate ? dateOnly(invoice.dueDate) : "",
  }));

  // 5. Convert Prisma transactions into engine inputs.
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
      (item) => item.duplicateTransactionId,
    ),
  );

  // 7. Exclude duplicates and incoming credits.
  const eligibleTransactions = transactions.filter(
    (transaction) =>
      transaction.direction === "DEBIT" &&
      !duplicateIds.has(transaction.id),
  );

  // 8. Execute the existing allocation engine.
  const allocation = allocateTransactions(
    invoices,
    eligibleTransactions,
  );

  // 9. Prevent duplicate allocation records.
  const allocationTransactionIds = allocation.allocations.map(
    (item) => item.transactionId,
  );

  if (allocationTransactionIds.length > 0) {
    const existingAllocations = await prisma.paymentAllocation.findMany({
      where: {
        transactionId: {
          in: allocationTransactionIds,
        },
      },
      select: {
        transactionId: true,
      },
    });

    if (existingAllocations.length > 0) {
      throw new Error(
        "Some transactions already have payment allocations. " +
        "Review existing allocations before running reconciliation again.",
      );
    }
  }

  // 10. Save the run, proposals, exceptions and audit record atomically.
  const savedRun = await prisma.$transaction(async (tx) => {
    const run = await tx.reconciliationRun.create({
      data: {
        workspaceId: workspace.id,
        status: "RUNNING",
      },
    });

    // Save proposed allocations.
    for (const item of allocation.allocations) {
      await tx.paymentAllocation.create({
        data: {
          workspaceId: workspace.id,
          invoiceId: item.invoiceId,
          transactionId: item.transactionId,
          runId: run.id,
          amount: item.amount.toFixed(4),
          currency: item.currency,
          status: "PROPOSED",
        },
      });
    }

    // Save duplicate exceptions.
    for (const duplicate of duplicateCandidates) {
      await tx.reconciliationException.create({
        data: {
          workspaceId: workspace.id,
          runId: run.id,
          transactionId: duplicate.duplicateTransactionId,
          type: "POSSIBLE_DUPLICATE",
          status: "OPEN",
          reason: duplicate.reason,
        },
      });
    }

    // Save allocation exceptions.
    for (const exception of allocation.exceptions) {
      const exceptionType =
        exception.type === "UNMATCHED"
          ? "UNMATCHED_TRANSACTION"
          : exception.type === "AMBIGUOUS"
            ? "AMBIGUOUS_MATCH"
            : "INVALID_TRANSACTION";

      await tx.reconciliationException.create({
        data: {
          workspaceId: workspace.id,
          runId: run.id,
          transactionId: exception.transactionId,
          type: exceptionType,
          status: "OPEN",
          reason:
            exception.reason +
            (exception.candidateInvoiceIds.length > 0
              ? ` Candidate invoices: ${exception.candidateInvoiceIds.join(", ")}`
              : ""),
        },
      });
    }

    // Mark the reconciliation run as completed.
    await tx.reconciliationRun.update({
      where: { id: run.id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // Record the operation in the audit log.
    await tx.auditLog.create({
      data: {
        workspaceId: workspace.id,
        action: "RECONCILIATION_RUN_COMPLETED",
        entityType: "ReconciliationRun",
        entityId: run.id,
        details: {
          invoiceCount: invoices.length,
          transactionCount: transactions.length,
          duplicateCount: duplicateCandidates.length,
          proposedAllocationCount: allocation.allocations.length,
          exceptionCount:
            duplicateCandidates.length + allocation.exceptions.length,
        },
      },
    });

    return run;
  });

  console.log("\n========== FINFLOW AI PERSISTENCE ==========");
  console.log("Reconciliation run:", savedRun.id);
  console.log("Run status: COMPLETED");
  console.log("Invoices processed:", invoices.length);
  console.log("Transactions processed:", transactions.length);
  console.log("Duplicate exceptions saved:", duplicateCandidates.length);
  console.log("Proposed allocations saved:", allocation.allocations.length);
  console.log("Allocation exceptions saved:", allocation.exceptions.length);
  console.log("Audit log: CREATED");
  console.log("Invoice statuses: UNCHANGED");
  console.log("============================================");
}

main()
  .catch((error) => {
    console.error("Reconciliation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });