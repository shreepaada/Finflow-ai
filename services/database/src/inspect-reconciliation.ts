
import { prisma } from "./db.js";

async function main() {
  const workspace = await prisma.workspace.findUnique({
    where: {
      slug: "demo-freelance",
    },
    select: {
      id: true,
      name: true,
    },
  });

  if (!workspace) {
    console.log("Workspace not found.");
    return;
  }

  console.log("\nWorkspace:");
  console.table([workspace]);

  const runs = await prisma.reconciliationRun.findMany({
    where: {
      workspaceId: workspace.id,
    },
    orderBy: {
      startedAt: "desc",
    },
    include: {
      _count: {
        select: {
          allocations: true,
          exceptions: true,
        },
      },
    },
  });

  console.log("\nReconciliation runs:");
  console.table(
    runs.map((run) => ({
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      allocations: run._count.allocations,
      exceptions: run._count.exceptions,
    })),
  );

  const allocations = await prisma.paymentAllocation.findMany({
    where: {
      workspaceId: workspace.id,
    },
    select: {
      id: true,
      invoiceId: true,
      transactionId: true,
      status: true,
      amount: true,
      runId: true,
    },
  });

  console.log("\nExisting allocations:");
  console.table(allocations);

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      workspaceId: workspace.id,
    },
    select: {
      id: true,
      description: true,
      externalReference: true,
      amount: true,
      currency: true,
      direction: true,
      allocation: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  console.log("\nBank transactions and allocation status:");
  console.table(
    transactions.map((transaction) => ({
      id: transaction.id,
      description: transaction.description,
      externalReference: transaction.externalReference,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      direction: transaction.direction,
      allocationId: transaction.allocation?.id ?? "None",
      allocationStatus: transaction.allocation?.status ?? "Unallocated",
    })),
  );
  
  const exceptionId = "80b1f3fa-65e0-4d05-a453-d3df667ab22d";

  const exception = await prisma.reconciliationException.findFirst({
    where: {
      id: exceptionId,
      workspaceId: workspace.id,
    },
    select: {
      id: true,
      type: true,
      status: true,
      reason: true,
      resolutionNote: true,
      createdAt: true,
      resolvedAt: true,
    },
  });

  console.log("\nResolved exception:");
  console.table(
    exception
      ? [{
          id: exception.id,
          type: exception.type,
          status: exception.status,
          reason: exception.reason,
          resolutionNote: exception.resolutionNote,
          createdAt: exception.createdAt,
          resolvedAt: exception.resolvedAt,
        }]
      : [],
  );

  const auditLogs = await prisma.auditLog.findMany({
    where: {
      workspaceId: workspace.id,
      entityId: exceptionId,
      action: "EXCEPTION_RESOLVED",
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      action: true,
      entityType: true,
      entityId: true,
      details: true,
      createdAt: true,
    },
  });

  console.log("\nException resolution audit log:");
  console.dir(auditLogs, { depth: null });

    const invoices = await prisma.invoice.findMany({
    where: {
      workspaceId: workspace.id,
    },
    select: {
      id: true,
      vendorNameSnapshot: true,
      amount: true,
      currency: true,
      status: true,
    },
  });

  console.log("\nInvoices:");
  console.table(
    invoices.map((invoice) => ({
      id: invoice.id,
      vendor: invoice.vendorNameSnapshot,
      amount: invoice.amount.toString(),
      currency: invoice.currency,
      status: invoice.status,
    })),
  );
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
