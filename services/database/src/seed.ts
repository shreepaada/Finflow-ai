import { prisma } from "./db.js";

async function main() {
  // 1. Create or reuse a demo workspace
  const workspace = await prisma.workspace.upsert({
    where: { slug: "demo-freelance" },
    update: {},
    create: {
      name: "Demo Freelance Workspace",
      slug: "demo-freelance",
      timezone: "Asia/Kolkata",
      baseCurrency: "INR",
    },
  });

  // 2. Create or reuse vendors
  const amazon = await prisma.vendor.upsert({
    where: {
      workspaceId_normalizedName: {
        workspaceId: workspace.id,
        normalizedName: "amazon",
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: "Amazon",
      normalizedName: "amazon",
    },
  });

  const flipkart = await prisma.vendor.upsert({
    where: {
      workspaceId_normalizedName: {
        workspaceId: workspace.id,
        normalizedName: "flipkart",
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: "Flipkart",
      normalizedName: "flipkart",
    },
  });

  const adobe = await prisma.vendor.upsert({
    where: {
      workspaceId_normalizedName: {
        workspaceId: workspace.id,
        normalizedName: "adobe",
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      name: "Adobe",
      normalizedName: "adobe",
    },
  });

  // 3. Create or reuse invoices
  const invoices = [
    {
      vendorId: amazon.id,
      invoiceNumber: "INV-2026-001",
      vendorNameSnapshot: "Amazon",
      amount: "10000.00",
    },
    {
      vendorId: flipkart.id,
      invoiceNumber: "INV-2026-002",
      vendorNameSnapshot: "Flipkart",
      amount: "5000.00",
    },
    {
      vendorId: adobe.id,
      invoiceNumber: "INV-2026-003",
      vendorNameSnapshot: "Adobe",
      amount: "2000.00",
    },
  ];

  for (const invoice of invoices) {
    await prisma.invoice.upsert({
      where: {
        workspaceId_vendorId_invoiceNumber: {
          workspaceId: workspace.id,
          vendorId: invoice.vendorId,
          invoiceNumber: invoice.invoiceNumber,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        ...invoice,
        currency: "INR",
        issueDate: new Date("2026-11-01T00:00:00.000Z"),
        dueDate: new Date("2026-11-15T00:00:00.000Z"),
      },
    });
  }

  // 4. Create or reuse a bank account
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
        currency: "INR",
      },
    });
  }

  // 5. Create or reuse a statement import
  const statementImport = await prisma.statementImport.upsert({
    where: {
      bankAccountId_fileSha256: {
        bankAccountId: bankAccount.id,
        fileSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    },
    update: {},
    create: {
      workspaceId: workspace.id,
      bankAccountId: bankAccount.id,
      fileName: "demo-bank-statement.csv",
      fileSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      totalRows: 3,
      importedRows: 3,
      rejectedRows: 0,
    },
  });

  // 6. Create or reuse bank transactions
  const transactions = [
    {
      sourceRow: 1,
      externalReference: "DEMO-TXN-001",
      description: "AMAZON PAYMENT",
      normalizedDescription: "amazon payment",
      transactionDate: new Date("2026-11-02T00:00:00.000Z"),
      amount: "10000.00",
      currency: "INR",
      direction: "DEBIT",
      fingerprint: "amazon|2026-11-02|10000|INR|DEBIT",
    },
    {
      sourceRow: 2,
      externalReference: "DEMO-TXN-002",
      description: "FLIPKART PAYMENT",
      normalizedDescription: "flipkart payment",
      transactionDate: new Date("2026-11-02T00:00:00.000Z"),
      amount: "5000.00",
      currency: "INR",
      direction: "DEBIT",
      fingerprint: "flipkart|2026-11-02|5000|INR|DEBIT",
    },
    {
      sourceRow: 3,
      externalReference: "DEMO-TXN-003",
      description: "AMAZON PAYMENT",
      normalizedDescription: "amazon payment",
      transactionDate: new Date("2026-11-02T00:00:00.000Z"),
      amount: "10000.00",
      currency: "INR",
      direction: "DEBIT",
      fingerprint: "amazon|2026-11-02|10000|INR|DEBIT",
    },
  ] as const;

  for (const transaction of transactions) {
    await prisma.bankTransaction.upsert({
      where: {
        statementImportId_sourceRow: {
          statementImportId: statementImport.id,
          sourceRow: transaction.sourceRow,
        },
      },
      update: {},
      create: {
        workspaceId: workspace.id,
        bankAccountId: bankAccount.id,
        statementImportId: statementImport.id,
        ...transaction,
      },
    });
  }

  console.log("Demo financial data created successfully!");
  console.log({
    workspace: workspace.name,
    vendors: 3,
    invoices: 3,
    bankAccount: bankAccount.bankName,
    bankTransactions: 3,
  });
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });