import { Workbook } from 'exceljs';

/** Every value an export row may carry in a column. */
export type ExportCellValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined;

/**
 * One column of a tabular export: the header text and the row field it reads.
 * The same column list drives both CSV and Excel so the two formats stay
 * identical.
 */
export interface ExportColumn<TRow> {
  header: string;
  key: keyof TRow & string;
}

/** Renders one export cell: dates as YYYY-MM-DD, null/undefined as empty. */
export function formatExportCell(value: ExportCellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}

/** Builds the CSV body for an export: header row, then one row per record. */
export function buildExportCsv<TRow extends Record<string, ExportCellValue>>(
  rows: TRow[],
  columns: ExportColumn<TRow>[],
): Buffer {
  // RFC-4180 escaping: wrap in quotes and double any embedded quote.
  const escape = (value: string): string => `"${value.replace(/"/g, '""')}"`;
  const lines = [
    columns.map((c) => escape(c.header)).join(','),
    ...rows.map((row) =>
      columns.map((c) => escape(formatExportCell(row[c.key]))).join(','),
    ),
  ];
  // Leading BOM so Excel opens UTF-8 (accented names) correctly.
  return Buffer.from('﻿' + lines.join('\r\n'), 'utf8');
}

/** Builds the xlsx body for an export: one bold-headed sheet named `sheetName`. */
export async function buildExportExcel<
  TRow extends Record<string, ExportCellValue>,
>(
  rows: TRow[],
  columns: ExportColumn<TRow>[],
  sheetName: string,
): Promise<Buffer> {
  const workbook = new Workbook();
  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: 18,
  }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) {
    sheet.addRow(
      columns.reduce<Record<string, string>>((acc, c) => {
        acc[c.key] = formatExportCell(row[c.key]);
        return acc;
      }, {}),
    );
  }
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
