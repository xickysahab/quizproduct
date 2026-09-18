import { describe, it, expect } from 'vitest';
import { Parser } from '@json2csv/plainjs';

/**
 * The export streams in pages of 200 and writes the header only on the first
 * one. A live session small enough to test end-to-end never reaches a second
 * page, so the chunked behaviour is pinned here instead — this is the check
 * behind swapping json2csv for its maintained successor.
 */
describe('CSV export', () => {
  const fields = ['ParticipantName', 'Q1 (Which, exactly?)', 'Q1 Score'];
  const rows = [
    { ParticipantName: 'आरव', 'Q1 (Which, exactly?)': 'said "yes"; then no', 'Q1 Score': 120 },
    { ParticipantName: 'Diya', 'Q1 (Which, exactly?)': 'No Answer', 'Q1 Score': 0 },
  ];

  it('writes a header on the first page', () => {
    const out = new Parser({ fields, header: true }).parse(rows);
    expect(out.split('\n')[0]).toBe('"ParticipantName","Q1 (Which, exactly?)","Q1 Score"');
  });

  it('omits the header on every page after the first', () => {
    const out = new Parser({ fields, header: false }).parse(rows);
    // A repeated header mid-file turns one table into three in every
    // spreadsheet that opens it.
    expect(out).not.toContain('ParticipantName');
    expect(out.split('\n')).toHaveLength(rows.length);
  });

  it('escapes the separators and quotes a question title can contain', () => {
    const out = new Parser({ fields, header: true }).parse(rows);
    // A comma inside a question title must not become a new column, and an
    // embedded quote is doubled rather than ending the field early.
    expect(out).toContain('"Q1 (Which, exactly?)"');
    expect(out).toContain('"said ""yes""; then no"');
  });

  it('keeps Indic names intact', () => {
    const out = new Parser({ fields, header: false }).parse(rows);
    expect(out).toContain('आरव');
  });
});
