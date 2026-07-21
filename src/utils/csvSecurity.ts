/**
 * Prevent spreadsheet applications from evaluating user-controlled CSV cells
 * as formulas. Quoting a CSV value is not enough; Excel and similar programs
 * may still execute values beginning with =, +, -, or @.
 */
export const sanitizeSpreadsheetCell = (value: unknown): string => {
  const text = String(value ?? "");
  return /^\s*[=+\-@]/.test(text) || /^[\t\r]/.test(text)
    ? `'${text}`
    : text;
};

export const escapeCsvCell = (value: unknown): string =>
  `"${sanitizeSpreadsheetCell(value).replace(/"/g, '""')}"`;

export const buildCsv = (rows: unknown[][]): string =>
  rows.map((row) => row.map(escapeCsvCell).join(",")).join("\n");
