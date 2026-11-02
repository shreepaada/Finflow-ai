
import type {
  Invoice,
  BankTransaction,
} from "../types/reconciliation";

function normalizeVendorName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function findExactMatch(
  invoice: Invoice,
  transactions: BankTransaction[],
): BankTransaction | undefined {
  const normalizedVendor = normalizeVendorName(
    invoice.vendorName,
  );

  return transactions.find((transaction) => {
    const normalizedDescription = normalizeVendorName(
      transaction.description,
    );

    return (
      transaction.amount === invoice.amount &&
      transaction.currency === invoice.currency &&
      normalizedDescription.includes(normalizedVendor)
    );
  });
}
