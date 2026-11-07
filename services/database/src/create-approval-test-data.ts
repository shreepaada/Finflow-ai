import { createHash } from "node:crypto";
import { prisma } from "./db.js";

const WORKSPACE_SLUG = "demo-freelance";
const TEST_VENDOR_NAME = "FinFlow Test Vendor";
const TEST_VENDOR_NORMALIZED = "finflow-test-vendor";
const TEST_INVOICE_NUMBER = "FF-TEST-001";
const TEST_AMOUNT = "3500.00";
const TEST_CURRENCY = "INR";

// Deterministic hash makes the script safe to rerun: it reuses the same
// statement import and transaction rather than creating duplicate records.
const TEST_IMPORT_HASH = createHash("sha256")
  .update("finflow-approval-workflow-test-import-v1")
  .digest("hex");

async function main() {
  const workspace = await prisma.workspace.findUnique({
    where: { slug: WORKSPACE_SLUG },
  });

  if (!workspace) {
    throw new Error(
      `Workspace "${WORKSPACE_SLUG}" was not found. Run your existing seed first.`,
    );
  }

  // Create or reuse a dedicated test vendor.
  const vendor = await prisma.vendor.upsert({
    where: {
      workspaceId_normalizedName: {
        workspaceId: workspace.id,
        normalizedName: TEST_VENDOR_NORMALIZED,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: TEST_VENDOR_NAME,
      normalizedName: TEST_VENDOR_NORMALIZED,
    },
  });

  // Create or reuse the test invoice. Existing invoice data is not overwritten.
  const invoice = await prisma.invoice.upsert({
    where: {
      workspaceId_vendorId_invoiceNumber: {
        workspaceId: workspace.id,
        vendorId: vendor.id,
        invoiceNumber: TEST_INVOICE_NUMBER,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      vendorId: vendor.id,
      invoiceNumber: TEST_INVOICE_NUMBER,
      vendorNameSnapshot: TEST_VENDOR_NAME,
      amount: TEST_AMOUNT,
      currency: TEST_CURRENCY,
      issueDate: new Date("2026-11-06T00:00:00.000Z"),
      dueDate: new Date("2026-11-20T00:00:00.000Z"),
      status: "UNPAID",
      notes: "Dedicated test invoice for reconciliation approval workflow.",
    },
  });

  // Reuse the existing Demo Bank account, or create it if absent.
  let bankAccount = await prisma.bankAccount.findFirst({
    where: {
      workspaceId: workspace.id,
      bankName: "Demo Bank",
      accountLast4: "1234",
    },
  });

  if (!bankAccount) {
    bankAccount = await prisma.bankAccount.create({
      data: {
        workspaceId: workspace.id,
        bankName: "Demo Bank",
        accountName: "Demo Business Account",
        accountLast4: "1234",
        currency: TEST_CURRENCY,
      },
    });
  }

  // Create or reuse a separate statement import for this test.
  const statementImport = await prisma.statementImport.upsert({
    where: {
      bankAccountId_fileSha256: {
        bankAccountId: bankAccount.id,
        fileSha256: TEST_IMPORT_HASH,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      bankAccountId: bankAccount.id,
      fileName: "finflow-approval-test.csv",
      fileSha256: TEST_IMPORT_HASH,
      totalRows: 1,
      importedRows: 1,
      rejectedRows: 0,
    },
  });

  // Invoice number is included in description/reference, so the allocation
  // engine should match this invoice using its explicit-invoice-number rule.
  const transaction = await prisma.bankTransaction.upsert({
    where: {
      statementImportId_sourceRow: {
        statementImportId: statementImport.id,
        sourceRow: 1,
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      bankAccountId: bankAccount.id,
      statementImportId: statementImport.id,
      sourceRow: 1,
      externalReference: TEST_INVOICE_NUMBER,
      description: `Payment to ${TEST_VENDOR_NAME} - ${TEST_INVOICE_NUMBER}`,
      normalizedDescription: `payment to ${TEST_VENDOR_NORMALIZED} ${TEST_INVOICE_NUMBER.toLowerCase()}`,
      transactionDate: new Date("2026-11-06T00:00:00.000Z"),
      amount: TEST_AMOUNT,
      currency: TEST_CURRENCY,
      direction: "DEBIT",
      fingerprint: "finflow-test-vendor|2026-11-06|3500|INR|DEBIT|FF-TEST-001",
    },
  });

  console.log("Approval workflow test data is ready.");
  console.log({
    workspace: workspace.name,
    vendor: vendor.name,
    invoice: {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      amount: invoice.amount.toString(),
      currency: invoice.currency,
      status: invoice.status,
    },
    statementImportId: statementImport.id,
    transaction: {
      id: transaction.id,
      reference: transaction.externalReference,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      direction: transaction.direction,
    },
  });
}

main()
  .catch((error) => {
    console.error("Test data creation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
