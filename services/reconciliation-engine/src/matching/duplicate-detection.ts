
import type { BankTransaction } from "../types/reconciliation";

export type DuplicateDetectionMethod =
  | "BANK_REFERENCE"
  | "TRANSACTION_FINGERPRINT";

export interface DuplicateCandidate {
  originalTransactionId: string;
  duplicateTransactionId: string;
  method: DuplicateDetectionMethod;
  reason: string;
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}


function getFingerprint(
  transaction: BankTransaction,
  bankAccountId: string,
): {
  key: string;
  method: DuplicateDetectionMethod;
} {
  const account = normalize(bankAccountId);
  const currency = transaction.currency.toUpperCase();
  const amount = transaction.amount.toString();
  const direction = transaction.direction ?? "UNKNOWN";

  const reference = transaction.reference?.trim();

  if (reference) {
    return {
      key: [
        account,
        direction,
        "reference",
        normalize(reference),
        amount,
        currency,
      ].join("|"),
      method: "BANK_REFERENCE",
    };
  }

  const date = transaction.transactionDate.split("T")[0];
  const description = normalize(transaction.description);

  return {
    key: [
      account,
      direction,
      "fingerprint",
      date,
      amount,
      currency,
      description,
    ].join("|"),
    method: "TRANSACTION_FINGERPRINT",
  };
}


export function findDuplicateCandidates(
  transactions: BankTransaction[],
  bankAccountId: string,
): DuplicateCandidate[] {
  if (!bankAccountId.trim()) {
    throw new Error("Bank account ID is required.");
  }

  const seen = new Map<
    string,
    {
      transactionId: string;
      method: DuplicateDetectionMethod;
    }
  >();

  const duplicates: DuplicateCandidate[] = [];

  for (const transaction of transactions) {
    if (
      !Number.isFinite(transaction.amount) ||
      transaction.amount <= 0
    ) {
      continue;
    }

    const { key, method } = getFingerprint(
      transaction,
      bankAccountId,
    );

    const existing = seen.get(key);

    if (existing) {
      duplicates.push({
        originalTransactionId: existing.transactionId,
        duplicateTransactionId: transaction.id,
        method,
        reason:
          method === "BANK_REFERENCE"
            ? "Same bank reference, amount, currency, and account."
            : "Same date, amount, currency, description, and account.",
      });

      continue;
    }

    seen.set(key, {
      transactionId: transaction.id,
      method,
    });
  }

  return duplicates;
}
