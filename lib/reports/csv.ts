export type CsvCell = string | number | null | undefined;

const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@']);

function needsFormulaGuard(value: string): boolean {
  if (value.length === 0) return false;
  const firstChar = value[0];
  if (firstChar === '\t' || firstChar === '\r') return true;
  const firstNonWhitespace = value.trimStart()[0];
  return firstNonWhitespace ? FORMULA_TRIGGERS.has(firstNonWhitespace) : false;
}

export function csvField(value: CsvCell): string {
  let text = value == null ? '' : String(value);
  if (needsFormulaGuard(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const lines = [
    headers.map(csvField).join(','),
    ...rows.map((row) => row.map(csvField).join(',')),
  ];
  return `\ufeff${lines.join('\r\n')}`;
}
