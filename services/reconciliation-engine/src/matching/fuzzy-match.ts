
import { fuzzy } from "fast-fuzzy";

import type {
  Invoice,
  BankTransaction,
} from "../types/reconciliation";

export interface FuzzyMatchResult {
  transaction: BankTransaction;
  similarity: number;
}

export function findFuzzyMatch(
  invoice: Invoice,
  transactions: BankTransaction[],
  threshold = 0.75,
): FuzzyMatchResult | undefined {
  const candidates = transactions
    .filter(
      (transaction) =>
        transaction.currency === invoice.currency &&
        transaction.amount === invoice.amount,
    )
    .map((transaction) => ({
      transaction,
      similarity: fuzzy(
        invoice.vendorName,
        transaction.description,
      ),
    }))
    .filter((candidate) => candidate.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  const bestMatch = candidates[0];

  if (!bestMatch) {
    return undefined;
  }

  return bestMatch;
}
