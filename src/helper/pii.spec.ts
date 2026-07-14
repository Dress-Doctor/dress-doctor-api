import { maskPhone, maskRecipients, variableKeys } from './pii';

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

describe('maskRecipients', () => {
  it('masks each recipient address', () => {
    expect(
      maskRecipients([{ address: '698765294' }, { address: '677000111' }]),
    ).toBe('******294,******111');
  });

  it('masks a bare string recipient', () => {
    expect(maskRecipients('698765294')).toBe('******294');
  });
});

describe('variableKeys', () => {
  it('returns keys only — never values (OTP codes, phones)', () => {
    const out = variableKeys({ code: '123456', customerPhone: '698765294' });
    expect(out).toBe('code,customerPhone');
    expect(out).not.toContain('123456');
    expect(out).not.toContain('698765294');
  });

  it('returns empty for undefined', () => {
    expect(variableKeys(undefined)).toBe('');
  });
});
