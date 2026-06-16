import { describe, expect, it } from 'vitest';
import { csvField, toCsv } from '@/lib/reports/csv';

describe('csvField', () => {
  it('quotes fields containing commas and doubles embedded quotes', () => {
    expect(csvField('He said "hi", bye')).toBe('"He said ""hi"", bye"');
  });

  it('keeps embedded newlines inside a quoted field', () => {
    expect(csvField('line one\nline two')).toBe('"line one\nline two"');
  });

  it('leaves plain fields unquoted', () => {
    expect(csvField('plain text')).toBe('plain text');
  });

  it('guards leading formula characters', () => {
    expect(csvField('=cmd')).toBe("'=cmd");
    expect(csvField('+cmd')).toBe("'+cmd");
    expect(csvField('-cmd')).toBe("'-cmd");
    expect(csvField('@cmd')).toBe("'@cmd");
    expect(csvField('\tcmd')).toBe("'\tcmd");
  });

  it('guards before quoting when formula text also needs RFC-4180 escaping', () => {
    expect(csvField('=a,b')).toBe('"\'=a,b"');
    expect(csvField('=a"b')).toBe('"\'=a""b"');
  });

  it('guards formula text after leading whitespace', () => {
    expect(csvField(' =cmd')).toBe("' =cmd");
    expect(csvField('\t=cmd')).toBe("'\t=cmd");
  });

  it('coerces nullish and numeric values before escaping', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
    expect(csvField(3)).toBe('3');
  });
});

describe('toCsv', () => {
  it('emits a BOM once followed by the header row and CRLF records', () => {
    const csv = toCsv(['A', 'B'], [['x', 'y']]);

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toBe('\ufeffA,B\r\nx,y');
  });
});
