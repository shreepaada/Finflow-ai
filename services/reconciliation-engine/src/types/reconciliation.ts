
export interface Invoice {
  id: string;
  invoiceNumber: string;
  vendorName: string;
  amount: number;
  currency: string;
  invoiceDate: string;
  dueDate: string;
}

export interface BankTransaction {
  id: string;
  description: string;
  amount: number;
  currency: string;
  transactionDate: string;
  reference?: string;
  direction?: "DEBIT" | "CREDIT";
}

export type MatchType =
  | "EXACT"
  | "FUZZY"
  | "PARTIAL"
  | "UNMATCHED";

export interface ReconciliationResult {
  invoiceId: string;
  transactionId?: string;
  matchType: MatchType;
  confidence: number;
  reason: string;
}

export type PaymentStatus =
  | "UNPAID"
  | "PARTIALLY_PAID"
  | "PAID"
  | "OVERPAID";



export interface PaymentAllocation {
  invoiceId: string;
  transactionId: string;
  amount: number;
  currency: string;
}

