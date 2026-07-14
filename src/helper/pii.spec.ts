import { maskPhone } from './pii';

describe('maskPhone', () => {
  it('keeps the last 3 digits and stars the rest', () => {
    expect(maskPhone('698765294')).toBe('******294');
  });

  it('returns "unknown" for empty/undefined', () => {
    expect(maskPhone(undefined)).toBe('unknown');
    expect(maskPhone('')).toBe('unknown');
  });

  it('fully masks very short values', () => {
    expect(maskPhone('12')).toBe('***');
  });
});
