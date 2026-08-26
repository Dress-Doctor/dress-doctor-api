import {
  DEFAULT_DIAL_CODE,
  phoneQuery,
  phoneVariants,
  toE164Digits,
} from './phone';

describe('phone', () => {
  describe('toE164Digits', () => {
    it('prefixes the default dial code onto a bare national number', () => {
      expect(toE164Digits('698765294')).toBe(`${DEFAULT_DIAL_CODE}698765294`);
    });

    it('strips whatever punctuation a human typed', () => {
      expect(toE164Digits('+237 698 765 294')).toBe('237698765294');
      expect(toE164Digits('+1 (202) 555-0123')).toBe('12025550123');
    });

    it('leaves a number that already carries a country code alone', () => {
      expect(toE164Digits('237698765294')).toBe('237698765294');
      expect(toE164Digits('12025550123')).toBe('12025550123');
    });
  });

  describe('phoneVariants', () => {
    it('matches a legacy row and a normalised one from the same input', () => {
      // The 9 digits a customer has always typed must still find an account
      // stored either way.
      expect(phoneVariants('698765294')).toEqual(
        expect.arrayContaining(['698765294', '237698765294']),
      );
    });

    it('works from the normalised form too', () => {
      expect(phoneVariants('237698765294')).toEqual(
        expect.arrayContaining(['237698765294', '698765294']),
      );
    });

    it('does not invent a national form for a foreign number', () => {
      // Stripping '1' off a US number would produce a different subscriber.
      expect(phoneVariants('12025550123')).toEqual(['12025550123']);
    });

    it('feeds $in directly', () => {
      expect(phoneQuery('698765294').$in).toContain('237698765294');
    });
  });
});
