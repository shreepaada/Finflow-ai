
import type {
  Invoice,
  PaymentAllocation,
  PaymentStatus,
} from "../types/reconciliation.js";

export interface PaymentStatusResult {
  invoiceId: string;
  invoiceAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: PaymentStatus;
}

export function calculatePaymentStatus(
  invoice: Invoice,
  payments: PaymentAllocation[],
): PaymentStatusResult {
  const transactionIds = new Set<string>();

  for (const payment of payments) {
    if (payment.invoiceId !== invoice.id) {
      throw new Error("Payment belongs to a different invoice.");
    }

    if (transactionIds.has(payment.transactionId)) {
      throw new Error(
        `Duplicate transaction allocation: ${payment.transactionId}`,
      );
    }

    transactionIds.add(payment.transactionId);

    if (payment.currency !== invoice.currency) {
      throw new Error(
        "Payment currency does not match invoice currency.",
      );
    }

    if (!Number.isFinite(payment.amount) || payment.amount <= 0) {
      throw new Error("Payment amount must be a positive finite number.");
    }
  }

  const paidAmount = payments.reduce(
    (total, payment) => total + payment.amount,
    0,
  );

  const outstandingAmount = invoice.amount - paidAmount;

  let status: PaymentStatus;

  if (paidAmount === 0) {
    status = "UNPAID";
  } else if (paidAmount < invoice.amount) {
    status = "PARTIALLY_PAID";
  } else if (paidAmount === invoice.amount) {
    status = "PAID";
  } else {
    status = "OVERPAID";
  }

  return {
    invoiceId: invoice.id,
    invoiceAmount: invoice.amount,
    paidAmount,
    outstandingAmount,
    status,
  };
}
