import { AppUtilService } from './app-util.service';

describe('AppUtilService', () => {
  const service = new AppUtilService();

  describe('parseRangeEnd', () => {
    it('returns undefined when no bound is given', () => {
      expect(service.parseRangeEnd()).toBeUndefined();
      expect(service.parseRangeEnd('')).toBeUndefined();
    });

    it('extends a date-only value to the end of that day', () => {
      const end = service.parseRangeEnd('2026-08-05');

      // Midnight would drop everything recorded on the 5th — the very day the
      // caller asked for.
      expect(end?.toISOString()).toBe('2026-08-05T23:59:59.999Z');
    });

    it('tolerates surrounding whitespace on a date-only value', () => {
      expect(service.parseRangeEnd(' 2026-08-05 ')?.toISOString()).toBe(
        '2026-08-05T23:59:59.999Z',
      );
    });

    it('takes an explicit time as given', () => {
      expect(
        service.parseRangeEnd('2026-08-05T10:00:00.000Z')?.toISOString(),
      ).toBe('2026-08-05T10:00:00.000Z');
    });
  });
});
