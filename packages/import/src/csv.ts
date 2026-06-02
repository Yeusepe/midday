import Papa from "papaparse";
import { formatAmountValue } from "./utils";

const COMPUTED_AMOUNT_COLUMN = "Amount";
const MIN_TRANSACTION_HEADER_SCORE = 8;

function normalizeForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\uFFFD/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function countReplacementCharacters(value: string) {
  return (value.match(/\uFFFD/g) ?? []).length;
}

function decodeWith(
  label: "utf-8" | "windows-1252",
  input: ArrayBuffer | Uint8Array,
) {
  return new TextDecoder(label).decode(input);
}

export function decodeImportCsvContent(input: ArrayBuffer | Uint8Array) {
  const utf8 = decodeWith("utf-8", input);
  const windows1252 = decodeWith("windows-1252", input);

  return countReplacementCharacters(windows1252) <
    countReplacementCharacters(utf8)
    ? windows1252
    : utf8;
}

function findColumn(
  fields: string[],
  matcher: (normalized: string) => boolean,
) {
  return fields.find((field) => matcher(normalizeForMatch(field)));
}

function parseCsvLine(line: string) {
  const parsed = Papa.parse<string[]>(line, {
    skipEmptyLines: false,
  });

  return parsed.data[0]?.map((value) => value.trim()) ?? [];
}

function hasAnyToken(value: string, tokens: string[]) {
  return tokens.some((token) => value.includes(token));
}

function isDateColumn(value: string) {
  return hasAnyToken(value, [
    "date",
    "fecha",
    "booking",
    "posted",
    "posting",
    "transaction date",
  ]);
}

function isDescriptionColumn(value: string) {
  return hasAnyToken(value, [
    "description",
    "descripcion",
    "detail",
    "memo",
    "concept",
    "merchant",
    "payee",
    "payer",
    "counterparty",
    "narrative",
    "reference",
    "referencia",
  ]);
}

function isDebitColumn(value: string) {
  return hasAnyToken(value, [
    "debit",
    "debito",
    "withdrawal",
    "money out",
    "paid out",
    "charge",
  ]);
}

function isCreditColumn(value: string) {
  return hasAnyToken(value, [
    "credit",
    "credito",
    "deposit",
    "money in",
    "paid in",
  ]);
}

function isBalanceColumn(value: string) {
  return hasAnyToken(value, ["balance", "saldo"]);
}

function isAmountColumn(value: string) {
  return (
    hasAnyToken(value, ["amount", "monto", "importe", "valor"]) &&
    !isDebitColumn(value) &&
    !isCreditColumn(value) &&
    !isBalanceColumn(value)
  );
}

function isCurrencyColumn(value: string) {
  return hasAnyToken(value, ["currency", "moneda"]);
}

function hasSplitAmountColumns(fields: string[]) {
  const normalizedFields = fields.map(normalizeForMatch);

  return (
    normalizedFields.some(isDebitColumn) &&
    normalizedFields.some(isCreditColumn)
  );
}

function scoreTransactionHeader(fields: string[]) {
  const normalizedFields = fields.map(normalizeForMatch);
  const hasDate = normalizedFields.some(isDateColumn);
  const hasAmount = normalizedFields.some(isAmountColumn);
  const hasSplitAmount = hasSplitAmountColumns(fields);

  if (fields.length < 3 || !hasDate || (!hasAmount && !hasSplitAmount)) {
    return 0;
  }

  let score = 4;

  if (hasAmount) {
    score += 4;
  }

  if (hasSplitAmount) {
    score += 5;
  }

  if (normalizedFields.some(isDescriptionColumn)) {
    score += 2;
  }

  if (normalizedFields.some(isBalanceColumn)) {
    score += 1;
  }

  if (normalizedFields.some(isCurrencyColumn)) {
    score += 1;
  }

  return score;
}

function findTransactionHeaderIndex(lines: string[]) {
  return lines.reduce(
    (best, line, index) => {
      const fields = parseCsvLine(line);
      const score = scoreTransactionHeader(fields);

      return score > best.score ? { index, score } : best;
    },
    { index: -1, score: 0 },
  );
}

function isLikelySummaryRow(fields: string[]) {
  const firstValue = normalizeForMatch(fields[0] ?? "");

  return ["total", "subtotal", "summary", "resumen", "closing", "opening"].some(
    (token) => firstValue.startsWith(token),
  );
}

function extractTransactionTable(lines: string[], headerIndex: number) {
  const header = lines[headerIndex];

  if (!header) {
    return null;
  }

  const headerFields = parseCsvLine(header);
  const tableLines = [header];

  for (const line of lines.slice(headerIndex + 1)) {
    if (!line.trim()) {
      if (tableLines.length > 1) {
        break;
      }

      continue;
    }

    const fields = parseCsvLine(line);

    if (
      tableLines.length > 1 &&
      (isLikelySummaryRow(fields) ||
        scoreTransactionHeader(fields) >= MIN_TRANSACTION_HEADER_SCORE ||
        fields.length < Math.max(2, Math.floor(headerFields.length / 2)))
    ) {
      break;
    }

    tableLines.push(line);
  }

  return tableLines.length > 1 ? tableLines.join("\n") : null;
}

function parseDayMonthDate(value?: string, dateColumn?: string) {
  const match = value?.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (!match) {
    return value;
  }

  const [, day, month, year] = match;
  const shouldUseDayMonth =
    normalizeForMatch(dateColumn ?? "").includes("fecha") ||
    Number(day) > 12 ||
    Number(month) > 12;

  if (!shouldUseDayMonth) {
    return value;
  }

  return `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`;
}

function formatComputedAmount(amount: number) {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

function normalizeTransactionCsv(csv: string) {
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
    transform: (value) => value.trim(),
  });

  const fields = parsed.meta.fields ?? [];
  const debitColumn = findColumn(fields, isDebitColumn);
  const creditColumn = findColumn(fields, isCreditColumn);
  const dateColumn = findColumn(fields, isDateColumn);

  if (!parsed.data.length) {
    return csv;
  }

  const hasSplitAmount = Boolean(debitColumn && creditColumn);
  const columns =
    !hasSplitAmount || fields.includes(COMPUTED_AMOUNT_COLUMN)
      ? fields
      : [...fields, COMPUTED_AMOUNT_COLUMN];

  const rows = parsed.data
    .filter((row) => Object.values(row).some((value) => value.trim()))
    .map((row) => {
      const debit = formatAmountValue({
        amount: debitColumn ? row[debitColumn] : undefined,
      });
      const credit = formatAmountValue({
        amount: creditColumn ? row[creditColumn] : undefined,
      });
      const amount =
        Math.abs(Number.isFinite(credit) ? credit : 0) -
        Math.abs(Number.isFinite(debit) ? debit : 0);

      return {
        ...row,
        ...(dateColumn
          ? { [dateColumn]: parseDayMonthDate(row[dateColumn], dateColumn) }
          : {}),
        ...(hasSplitAmount
          ? { [COMPUTED_AMOUNT_COLUMN]: formatComputedAmount(amount) }
          : {}),
      };
    });

  return Papa.unparse(rows, { columns });
}

export function normalizeImportCsvContent(content: string) {
  const lines = content
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
  const header = findTransactionHeaderIndex(lines);

  if (header.score < MIN_TRANSACTION_HEADER_SCORE) {
    return content;
  }

  if (
    header.index === 0 &&
    !hasSplitAmountColumns(parseCsvLine(lines[0] ?? ""))
  ) {
    return content;
  }

  const transactionCsv = extractTransactionTable(lines, header.index);

  return transactionCsv ? normalizeTransactionCsv(transactionCsv) : content;
}
