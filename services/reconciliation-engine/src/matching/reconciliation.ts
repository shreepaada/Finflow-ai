
import type {
  Invoice,
  BankTransaction,
  ReconciliationResult,
} from "../types/reconciliation";

import { findExactMatch } from "./exact-match";
import { findFuzzyMatch } from "./fuzzy-match";

export function reconcileInvoice(
  invoice: Invoice,
  transactions: BankTransaction[],
): ReconciliationResult {
  const exactMatch = findExactMatch(invoice, transactions);

  if (exactMatch) {
    return {
      invoiceId: invoice.id,
      transactionId: exactMatch.id,
      matchType: "EXACT",
      confidence: 1,
      reason: "Exact vendor, amount, and currency match.",
    };
  }

  const fuzzyMatch = findFuzzyMatch(invoice, transactions);

  if (fuzzyMatch) {
    return {
      invoiceId: invoice.id,
      transactionId: fuzzyMatch.transaction.id,
      matchType: "FUZZY",
      confidence: fuzzyMatch.similarity,
      reason: `Vendor similarity score: ${fuzzyMatch.similarity.toFixed(2)}`,
    };
  }

  return {
    invoiceId: invoice.id,
    matchType: "UNMATCHED",
    confidence: 0,
    reason: "No matching transaction found.",
  };
}
