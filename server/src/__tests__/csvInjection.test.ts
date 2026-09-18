import { describe, expect, it } from 'vitest';
import { csvSafe } from '../controllers/analytics.controller';

/**
 * Joining a room takes a code and a display name and nothing else, so every
 * name in an export was chosen by someone the host never authenticated. These
 * are the payloads that came back live from the export before it was defused.
 */
describe('csvSafe', () => {
  it('defuses the four characters a spreadsheet reads as a formula', () => {
    expect(csvSafe('=1+1')).toBe("'=1+1");
    expect(csvSafe('+1+1')).toBe("'+1+1");
    expect(csvSafe('-1+1')).toBe("'-1+1");
    expect(csvSafe('@SUM(1+1)')).toBe("'@SUM(1+1)");
  });

  it('defuses the DDE command-execution form', () => {
    expect(csvSafe("=cmd|'/C calc'!A0")).toBe("'=cmd|'/C calc'!A0");
  });

  it('defuses leading control characters, which Excel also evaluates', () => {
    expect(csvSafe('\tcmd')).toBe("'\tcmd");
    expect(csvSafe('\r=1+1')).toBe("'\r=1+1");
  });

  it('leaves ordinary names untouched', () => {
    expect(csvSafe('Aagam')).toBe('Aagam');
    expect(csvSafe('Anonymous')).toBe('Anonymous');
    expect(csvSafe('No Answer')).toBe('No Answer');
    // Only the FIRST character decides; an equals sign inside a name is inert.
    expect(csvSafe('x=y')).toBe('x=y');
    expect(csvSafe('Priya (Design)')).toBe('Priya (Design)');
  });

  it('leaves scripts alone — they are not a spreadsheet risk, and React escapes them', () => {
    expect(csvSafe('<script>alert(1)</script>')).toBe('<script>alert(1)</script>');
  });

  it('is idempotent enough not to stack apostrophes on an already-safe value', () => {
    expect(csvSafe(csvSafe('Aagam'))).toBe('Aagam');
  });
});
