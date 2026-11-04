
import Papa from "papaparse";
import { randomUUID } from "node:crypto";
import type { BankTransaction } from "./types/reconciliation";



export type DateFormat = "DMY" | "MDY";

export interface CsvImportOptions {
  bankAccountId: string;
  defaultCurrency?: string;
  dateFormat?: DateFormat;
  positiveAmountDirection?: "DEBIT" | "CREDIT";
}

export interface ImportedBankTransaction extends BankTransaction {
  bankAccountId: string;
  sourceRow: number;
  direction: "DEBIT" | "CREDIT";
}

export interface CsvImportIssue {
  rowNumber?: number;
  code: string;
  message: string;
}

export interface CsvImportResult {
  bankAccountId: string;
  totalRows: number;
  importedCount: number;
  rejectedCount: number;
  transactions: ImportedBankTransaction[];
  issues: CsvImportIssue[];
}

type CsvRow = Record<string, string>;

const DATE_COLUMNS = [
  "date",
  "transaction_date",
  "transactiondate",
  "txn_date",
  "value_date",
  "posting_date",
];

const DESCRIPTION_COLUMNS = [
  "description",
  "narration",
  "particulars",
  "details",
  "transaction_details",
];

const AMOUNT_COLUMNS = [
  "amount",
  "transaction_amount",
];

const DEBIT_COLUMNS = [
  "debit",
  "withdrawal",
  "withdrawals",
  "dr",
];

const CREDIT_COLUMNS = [
  "credit",
  "deposit",
  "deposits",
  "cr",
];

const CURRENCY_COLUMNS = [
  "currency",
  "ccy",
];

const REFERENCE_COLUMNS = [
  "reference",
  "reference_number",
  "transaction_reference",
  "txn_id",
  "utr",
  "bank_reference",
];

const DIRECTION_COLUMNS = [
  "direction",
  "type",
  "transaction_type",
  "dr_cr",
  "debit_credit",
];

function normalizeHeader(header: string): string {
  return header
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function hasHeader(
  headers: string[],
  aliases: string[],
): boolean {
  return aliases.some((alias) => headers.includes(alias));
}

function getValue(
  row: CsvRow,
  aliases: string[],
): string {
  for (const alias of aliases) {
    const value = row[alias];

    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  return "";
}

function isValidDate(
  year: number,
  month: number,
  day: number,
): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatDate(
  year: number,
  month: number,
  day: number,
): string | undefined {
  if (!isValidDate(year, month, day)) {
    return undefined;
  }

  return [
    year.toString().padStart(4, "0"),
    month.toString().padStart(2, "0"),
    day.toString().padStart(2, "0"),
  ].join("-");
}

function parseDate(
  value: string,
  format: DateFormat,
): string | undefined {
  const input = value.trim();

  // ISO format: YYYY-MM-DD
  const isoMatch = input.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (isoMatch) {
    return formatDate(
      Number(isoMatch[1]),
      Number(isoMatch[2]),
      Number(isoMatch[3]),
    );
  }

  // Slash or dash format: DD/MM/YYYY or MM/DD/YYYY
  const localMatch = input.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/,
  );

  if (!localMatch) {
    return undefined;
  }

  const first = Number(localMatch[1]);
  const second = Number(localMatch[2]);
  const year = Number(localMatch[3]);

  const day = format === "DMY" ? first : second;
  const month = format === "DMY" ? second : first;

  return formatDate(year, month, day);
}

function parseMoney(value: string): number | undefined {
  let input = value.trim();

  if (!input) {
    return undefined;
  }

  let negative = false;

  // Support accounting-style negatives: (500.00)
  if (input.startsWith("(") && input.endsWith(")")) {
    negative = true;
    input = input.slice(1, -1);
  }

  // Remove common currency symbols and currency codes.
  input = input
    .replace(/^[A-Z]{3}\s*/i, "")
    .replace(/[₹$€£]/g, "")
    .replace(/\s/g, "");

  if (input.startsWith("-")) {
    negative = true;
    input = input.slice(1);
  } else if (input.startsWith("+")) {
    input = input.slice(1);
  }

  // Accept 5000, 5000.50, and 5,000.50.
  // Reject ambiguous or malformed numeric formats.
  const validFormat =
    /^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/;

  if (!validFormat.test(input)) {
    return undefined;
  }

  const amount = Number(input.replace(/,/g, ""));

  if (!Number.isFinite(amount)) {
    return undefined;
  }

  return negative ? -amount : amount;
}

function parseDirection(
  value: string,
): "DEBIT" | "CREDIT" | undefined {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z]/g, "");

  if (
    ["debit", "dr", "withdrawal", "withdraw", "payment"].includes(
      normalized,
    )
  ) {
    return "DEBIT";
  }

  if (
    ["credit", "cr", "deposit", "deposited", "received"].includes(
      normalized,
    )
  ) {
    return "CREDIT";
  }

  return undefined;
}

function oppositeDirection(
  direction: "DEBIT" | "CREDIT",
): "DEBIT" | "CREDIT" {
  return direction === "DEBIT" ? "CREDIT" : "DEBIT";
}

export function importBankCsv(
  csvText: string,
  options: CsvImportOptions,
): CsvImportResult {
  if (!options.bankAccountId.trim()) {
    throw new Error("Bank account ID is required.");
  }

  if (!csvText.trim()) {
    throw new Error("CSV file is empty.");
  }

  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
    transformHeader: normalizeHeader,
  });

  const totalRows = parsed.data.length;
  const transactions: ImportedBankTransaction[] = [];
  const issues: CsvImportIssue[] = [];
  const rejectedRows = new Set<number>();

  // Track malformed CSV records.
  const parserErrorRows = new Set<number>();

  for (const error of parsed.errors) {
    if (typeof error.row === "number") {
      parserErrorRows.add(error.row);

      const rowNumber = error.row + 2;
      rejectedRows.add(rowNumber);

      issues.push({
        rowNumber,
        code: `CSV_${error.code}`,
        message: error.message,
      });
    } else {
      issues.push({
        code: `CSV_${error.code}`,
        message: error.message,
      });
    }
  }

  const headers = parsed.meta.fields ?? [];

  const hasDate = hasHeader(headers, DATE_COLUMNS);
  const hasDescription = hasHeader(
    headers,
    DESCRIPTION_COLUMNS,
  );

  const hasAmount = hasHeader(headers, AMOUNT_COLUMNS);
  const hasDebit = hasHeader(headers, DEBIT_COLUMNS);
  const hasCredit = hasHeader(headers, CREDIT_COLUMNS);
  const hasCurrency = hasHeader(headers, CURRENCY_COLUMNS);

  const hasSplitAmount = hasDebit && hasCredit;

  const schemaProblems: string[] = [];

  if (!hasDate) {
    schemaProblems.push("Missing transaction date column.");
  }

  if (!hasDescription) {
    schemaProblems.push("Missing transaction description column.");
  }

  if (hasDebit !== hasCredit) {
    schemaProblems.push(
      "Debit and credit columns must be provided together.",
    );
  }

  if (!hasSplitAmount && !hasAmount) {
    schemaProblems.push(
      "Provide an Amount column or both Debit and Credit columns.",
    );
  }

  if (
    !hasSplitAmount &&
    hasAmount &&
    !options.positiveAmountDirection
  ) {
    schemaProblems.push(
      "Specify positiveAmountDirection for single-amount CSV files.",
    );
  }

  if (!hasCurrency && !options.defaultCurrency) {
    schemaProblems.push(
      "Provide a Currency column or defaultCurrency option.",
    );
  }

  if (schemaProblems.length > 0) {
    for (const message of schemaProblems) {
      issues.push({
        code: "INVALID_CSV_SCHEMA",
        message,
      });
    }

    return {
      bankAccountId: options.bankAccountId,
      totalRows,
      importedCount: 0,
      rejectedCount: totalRows,
      transactions: [],
      issues,
    };
  }

  const dateFormat = options.dateFormat ?? "DMY";

  for (const [index, row] of parsed.data.entries()) {
    const rowNumber = index + 2;

    if (parserErrorRows.has(index)) {
      continue;
    }

    const issue = (
      code: string,
      message: string,
    ): void => {
      rejectedRows.add(rowNumber);

      issues.push({
        rowNumber,
        code,
        message,
      });
    };

    if (Object.hasOwn(row, "__parsed_extra")) {
      issue(
        "EXTRA_COLUMNS",
        "This row contains more fields than the CSV header.",
      );
      continue;
    }

    const dateValue = getValue(row, DATE_COLUMNS);
    const description = getValue(
      row,
      DESCRIPTION_COLUMNS,
    ).replace(/\s+/g, " ");

    const currency = (
      getValue(row, CURRENCY_COLUMNS) ||
      options.defaultCurrency ||
      ""
    ).toUpperCase();

    const transactionDate = parseDate(
      dateValue,
      dateFormat,
    );

    if (!transactionDate) {
      issue("INVALID_DATE", `Invalid transaction date: ${dateValue}`);
      continue;
    }

    if (!description) {
      issue("MISSING_DESCRIPTION", "Transaction description is empty.");
      continue;
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
      issue("INVALID_CURRENCY", `Invalid currency: ${currency}`);
      continue;
    }

    let amount: number;
    let direction: "DEBIT" | "CREDIT";

    if (hasSplitAmount) {
      const debitRaw = getValue(row, DEBIT_COLUMNS);
      const creditRaw = getValue(row, CREDIT_COLUMNS);

      const debit = debitRaw === "" ? 0 : parseMoney(debitRaw);
      const credit = creditRaw === "" ? 0 : parseMoney(creditRaw);

      if (debit === undefined || credit === undefined) {
        issue(
          "INVALID_AMOUNT",
          "Debit or credit amount is invalid.",
        );
        continue;
      }

      if (debit < 0 || credit < 0) {
        issue(
          "INVALID_AMOUNT",
          "Debit and credit columns must contain non-negative amounts.",
        );
        continue;
      }

      if (debit > 0 && credit > 0) {
        issue(
          "CONFLICTING_AMOUNTS",
          "A transaction cannot have both debit and credit amounts.",
        );
        continue;
      }

      if (debit === 0 && credit === 0) {
        issue(
          "MISSING_AMOUNT",
          "Both debit and credit amounts are empty or zero.",
        );
        continue;
      }

      amount = debit > 0 ? debit : credit;
      direction = debit > 0 ? "DEBIT" : "CREDIT";
    } else {
      const rawAmount = getValue(row, AMOUNT_COLUMNS);
      const signedAmount = parseMoney(rawAmount);

      if (signedAmount === undefined || signedAmount === 0) {
        issue(
          "INVALID_AMOUNT",
          `Invalid or zero transaction amount: ${rawAmount}`,
        );
        continue;
      }

      const declaredDirection = parseDirection(
        getValue(row, DIRECTION_COLUMNS),
      );

      if (
        getValue(row, DIRECTION_COLUMNS) &&
        !declaredDirection
      ) {
        issue(
          "INVALID_DIRECTION",
          "Transaction direction must identify debit or credit.",
        );
        continue;
      }

      const positiveDirection =
        options.positiveAmountDirection!;

      direction =
        declaredDirection ??
        (signedAmount < 0
          ? oppositeDirection(positiveDirection)
          : positiveDirection);

      amount = Math.abs(signedAmount);
    }

    const reference = getValue(row, REFERENCE_COLUMNS);

    transactions.push({
      id: randomUUID(),
      bankAccountId: options.bankAccountId,
      sourceRow: rowNumber,
      description,
      amount,
      currency,
      transactionDate,
      reference: reference || undefined,
      direction,
    });
  }

  return {
    bankAccountId: options.bankAccountId,
    totalRows,
    importedCount: transactions.length,
    rejectedCount: rejectedRows.size,
    transactions,
    issues,
  };
}
