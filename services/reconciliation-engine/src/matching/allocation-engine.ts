
import { fuzzy } from "fast-fuzzy";

import type {
  Invoice,
  BankTransaction,
  PaymentAllocation,
} from "../types/reconciliation";

import {
  calculatePaymentStatus,
  type PaymentStatusResult,
} from "./payment-status";

export interface AllocationException {
  transactionId: string;
  type: "UNMATCHED" | "AMBIGUOUS" | "INVALID_TRANSACTION";
  candidateInvoiceIds: string[];
  reason: string;
}

export interface AllocationEngineResult {
  allocations: PaymentAllocation[];
  invoiceStatuses: PaymentStatusResult[];
  exceptions: AllocationException[];
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getVendorScore(
  invoice: Invoice,
  transaction: BankTransaction,
): number {
  const vendor = normalize(invoice.vendorName);

  const description = normalize(
    `${transaction.description} ${transaction.reference ?? ""}`,
  );

  if (!vendor || !description) {
    return 0;
  }

  if (description.includes(vendor)) {
    return 1;
  }

  return fuzzy(vendor, description);
}

export function allocateTransactions(
  invoices: Invoice[],
  transactions: BankTransaction[],
  threshold = 0.75,
): AllocationEngineResult {
  const invoiceIds = new Set<string>();

  for (const invoice of invoices) {
    if (invoiceIds.has(invoice.id)) {
      throw new Error(`Duplicate invoice ID: ${invoice.id}`);
    }

    if (!Number.isFinite(invoice.amount) || invoice.amount <= 0) {
      throw new Error(`Invalid invoice amount: ${invoice.id}`);
    }

    invoiceIds.add(invoice.id);
  }

  const transactionIds = new Set<string>();

  for (const transaction of transactions) {
    if (transactionIds.has(transaction.id)) {
      throw new Error(`Duplicate transaction ID: ${transaction.id}`);
    }

    transactionIds.add(transaction.id);
  }

  const remainingAmounts = new Map<string, number>(
    invoices.map((invoice) => [invoice.id, invoice.amount]),
  );

  const allocations: PaymentAllocation[] = [];
  const exceptions: AllocationException[] = [];

  // Process transactions in chronological order.
  const sortedTransactions = [...transactions].sort(
    (a, b) =>
      a.transactionDate.localeCompare(b.transactionDate) ||
      a.id.localeCompare(b.id),
  );

  for (const transaction of sortedTransactions) {
    if (
      !Number.isFinite(transaction.amount) ||
      transaction.amount <= 0
    ) {
      exceptions.push({
        transactionId: transaction.id,
        type: "INVALID_TRANSACTION",
        candidateInvoiceIds: [],
        reason: "Transaction amount must be positive and finite.",
      });

      continue;
    }

    const eligibleInvoices = invoices.filter((invoice) => {
      return (
        invoice.currency === transaction.currency &&
        (remainingAmounts.get(invoice.id) ?? 0) > 0
      );
    });

    // Prefer an explicit invoice number in the bank description.
    const searchableText = normalize(
      `${transaction.description} ${transaction.reference ?? ""}`,
    );

    const referenceMatches = eligibleInvoices.filter((invoice) => {
      const invoiceNumber = normalize(invoice.invoiceNumber);

      return (
        invoiceNumber.length > 0 &&
        searchableText.includes(invoiceNumber)
      );
    });

    const candidates =
      referenceMatches.length > 0
        ? referenceMatches
        : eligibleInvoices.filter((invoice) => {
            return (
              getVendorScore(invoice, transaction) >= threshold
            );
          });

    if (candidates.length === 0) {
      exceptions.push({
        transactionId: transaction.id,
        type: "UNMATCHED",
        candidateInvoiceIds: [],
        reason: "No eligible invoice matched this transaction.",
      });

      continue;
    }

    if (candidates.length > 1) {
      exceptions.push({
        transactionId: transaction.id,
        type: "AMBIGUOUS",
        candidateInvoiceIds: candidates.map(
          (invoice) => invoice.id,
        ),
        reason:
          "Multiple invoices could match this transaction. Manual review required.",
      });

      continue;
    }

    const selectedInvoice = candidates[0];

    allocations.push({
      invoiceId: selectedInvoice.id,
      transactionId: transaction.id,
      amount: transaction.amount,
      currency: transaction.currency,
    });

    const remaining =
      (remainingAmounts.get(selectedInvoice.id) ?? 0) -
      transaction.amount;

    remainingAmounts.set(selectedInvoice.id, remaining);
  }

  const invoiceStatuses = invoices.map((invoice) => {
    const invoicePayments = allocations.filter(
      (allocation) => allocation.invoiceId === invoice.id,
    );

    return calculatePaymentStatus(invoice, invoicePayments);
  });

  return {
    allocations,
    invoiceStatuses,
    exceptions,
  };
}
