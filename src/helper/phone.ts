/**
 * Phone numbers are stored as **digits with the country code and no symbols** —
 * `237698765294`, `12025550123`. That is the shape WhatsApp Cloud API wants and
 * the shape the profile edit already allowed (`MaxLength(15)`), so it is the one
 * every write path now normalises to.
 *
 * Rows written before this exist as bare national digits (`670678660`), because
 * Cameroon was the only market. `phoneVariants` is what lets both shapes find
 * the same person while `npm run backfill:phone-e164` has yet to run — or never
 * runs at all.
 */

/** The market the business operates in, and so the code a bare number implies. */
export const DEFAULT_DIAL_CODE = '237';

/** National number length in the default market. */
const DEFAULT_NATIONAL_LENGTH = 9;

/** E.164 allows 15 digits at most, including the country code. */
export const PHONE_MIN_DIGITS = 8;
export const PHONE_MAX_DIGITS = 15;

/** Everything that is not a digit — a `+`, spaces, dashes a human typed. */
const NON_DIGITS = /\D/g;

/**
 * The stored form of a number: digits only, country code included.
 *
 * A bare national number is assumed to be Cameroonian, which is what it always
 * meant before other countries were accepted. Anything already carrying a
 * country code is left as it is — including numbers that merely happen to be 9
 * digits long elsewhere, since there is nothing in the string to tell them
 * apart and guessing would corrupt the ones that are right.
 */
export function toE164Digits(value: string): string {
  const digits = value.replace(NON_DIGITS, '');
  if (digits.length === DEFAULT_NATIONAL_LENGTH) {
    return `${DEFAULT_DIAL_CODE}${digits}`;
  }
  return digits;
}

/**
 * Every stored spelling of one number, for a lookup that must match rows
 * written before and after the change: the normalised form, and the bare
 * national form a legacy Cameroon row still carries.
 *
 * Feed it to `$in` rather than comparing to a single string — a signed-in
 * customer typing the 9 digits they have always typed must still find their
 * account.
 */
export function phoneVariants(value: string): string[] {
  const digits = value.replace(NON_DIGITS, '');
  const normalised = toE164Digits(digits);

  const variants = new Set([digits, normalised]);
  if (normalised.startsWith(DEFAULT_DIAL_CODE)) {
    variants.add(normalised.slice(DEFAULT_DIAL_CODE.length));
  }
  return [...variants].filter(Boolean);
}

/** A Mongo filter matching a phone in any of its stored spellings. */
export function phoneQuery(value: string): { $in: string[] } {
  return { $in: phoneVariants(value) };
}
