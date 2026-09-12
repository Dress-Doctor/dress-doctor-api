/**
 * Reading the 2026 Sales sheet: the parts with no database behind them.
 *
 * Separated from `migrate-sales.ts` so they can be tested on their own. Every
 * function here is pure — hand it a string, get a value or a stated failure —
 * because the mistakes that matter in a migration are not the writes, they are
 * the readings: a date read as the wrong month, a `3,000` read as `3`, a
 * service type matched by an emoji that survived one export and not the next.
 */
import {
  OrderItemConditionEnum,
  PricingModelEnum,
} from 'src/schema/order/order.dto';
import { PaymentPeriodEnum } from 'src/schema/payment/payment.dto';

/** One CSV row, keyed by the header above it, lower-cased and trimmed. */
export type CsvRow = Record<string, string>;

/**
 * A minimal CSV reader: quoted fields, doubled quotes inside them, commas and
 * newlines within quotes, CRLF or LF.
 *
 * Hand-rolled rather than a dependency because the whole grammar is four
 * characters wide and the alternative is a package in the runtime image for
 * one script that runs a handful of times.
 */
export function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  // A BOM at the head of a spreadsheet export would otherwise become part of
  // the first header, and every lookup against it would miss.
  const input = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      // A CRLF is one break, not two.
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }

  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  if (!header) return [];

  const keys = header.map((name) => name.trim().toLowerCase());

  return (
    body
      .map((cells) => {
        const record: CsvRow = {};
        keys.forEach((key, index) => {
          record[key] = (cells[index] ?? '').trim();
        });
        return record;
      })
      // The sheet's tabs end in a run of empty rows — the formatting extends past
      // the data. A row with nothing in any column is padding, not a record.
      .filter((record) => Object.values(record).some((value) => value !== ''))
  );
}

/**
 * Money, as an integer of XAF.
 *
 * The sheet writes `3,000`, `22,500`, sometimes ` 6 400 ` — thousands
 * separators a person typed, in a currency with no minor unit. Anything with a
 * fractional part is a reading error rather than a price, so it is refused
 * rather than rounded: silently turning 3.5 into 4 is how a ledger stops
 * adding up.
 */
export function parseMoney(raw: string, field: string): number {
  const cleaned = (raw ?? '').replace(/[\s,\u00A0\u202F]/g, '');
  if (cleaned === '' || cleaned === '-') return 0;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    throw new Error(`${field}: "${raw}" is not a number`);
  }
  if (!Number.isInteger(value)) {
    throw new Error(`${field}: "${raw}" is not a whole number of XAF`);
  }

  return value;
}

/** A count or a weight: a plain number, blank meaning none. */
export function parseNumber(raw: string, field: string): number {
  const cleaned = (raw ?? '').replace(/[\s,\u00A0\u202F]/g, '');
  if (cleaned === '') return 0;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) {
    throw new Error(`${field}: "${raw}" is not a number`);
  }

  return value;
}

/**
 * A date, as the sheet writes it: `26-02-2026`, day first.
 *
 * Day-first is the one thing this function exists to get right. `03-04-2026`
 * is the 3rd of April in Douala and the 4th of March to anything that assumes
 * American order, and a month of trade landing in the wrong month is invisible
 * until somebody closes the books.
 *
 * Built in UTC at midday. Midnight UTC in a `+01:00` country renders as the
 * previous day for anyone reading it locally.
 */
export function parseSheetDate(raw: string, field: string): Date | undefined {
  const value = (raw ?? '').trim();
  if (!value) return undefined;

  const match = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(value);
  if (!match) {
    throw new Error(`${field}: "${raw}" is not a d-m-Y date`);
  }

  const [, day, month, year] = match.map(Number) as [
    unknown,
    number,
    number,
    number,
  ];

  if (month < 1 || month > 12 || day < 1 || day > 31) {
    throw new Error(`${field}: "${raw}" is not a real date`);
  }

  const date = new Date(Date.UTC(year, month - 1, day, 12));

  // Rolls over on the 31st of a 30-day month, which means the sheet says
  // something that never happened.
  if (date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) {
    throw new Error(`${field}: "${raw}" is not a real date`);
  }

  return date;
}

/**
 * Strips the emoji the sheet's own dropdowns carry, along with the mojibake an
 * export leaves behind when those emoji lose their encoding (`ð§º Wash Per
 * Piece`). What is left is the words, which is all anything here matches on.
 */
export function plainLabel(raw: string): string {
  return (raw ?? '')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `⚖️ Wash Per KG` → PER_KG, and the other three. */
export function parsePricingModel(raw: string): PricingModelEnum {
  const label = plainLabel(raw).toLowerCase();

  if (label.includes('per kg')) return PricingModelEnum.PER_KG;
  if (label.includes('per piece')) return PricingModelEnum.PER_PIECE;
  if (label.includes('subscription')) return PricingModelEnum.SUBSCRIPTION;
  if (label.includes('free')) return PricingModelEnum.FREE;

  throw new Error(`Service Type: "${raw}" is not a pricing model`);
}

/** The garment's state at the counter. Blank means nothing was noted. */
export function parseCondition(raw: string): OrderItemConditionEnum {
  const label = plainLabel(raw).toLowerCase();
  if (!label) return OrderItemConditionEnum.NORMAL;

  const match = Object.values(OrderItemConditionEnum).find(
    (value) => value.toLowerCase() === label,
  );

  if (!match) throw new Error(`Condition: "${raw}" is not a known condition`);

  return match;
}

/** `Current` / `Prior` — whether a payment cleared an older month's balance. */
export function parseDebtType(raw: string): PaymentPeriodEnum | undefined {
  const label = plainLabel(raw).toLowerCase();
  if (!label) return undefined;
  if (label.startsWith('current')) return PaymentPeriodEnum.CURRENT;
  if (label.startsWith('prior') || label.startsWith('old')) {
    return PaymentPeriodEnum.PRIOR;
  }

  throw new Error(`Debt Type: "${raw}" is neither Current nor Prior`);
}

/**
 * The sheet's name for a payment method, as the seeded `PaymentMethod` rows
 * spell it: the sheet says "MTN Mobile Money" where the platform says
 * "MTN Momo".
 */
export function normalisePaymentMethod(raw: string): string {
  const label = plainLabel(raw).toLowerCase();

  if (label.includes('mtn')) return 'MTN Momo';
  if (label.includes('orange')) return 'Orange Money';
  if (label.includes('cash')) return 'Cash';

  return plainLabel(raw);
}

/**
 * A phone number in the form the `User.phone` column holds.
 *
 * Cameroonian numbers are stored local and bare — nine digits, no country
 * code — and the sheet writes them both ways (`675104631`, `+237 675 104
 * 631`), so the country code comes off. A number that is not Cameroonian is
 * kept exactly as dialled, country code and all: the sheet has at least one
 * London number, and truncating it to nine digits would invent a Douala
 * customer who does not exist.
 *
 * Phone is how an account is identified and how its OTP is addressed, so a
 * blank is refused rather than filled in.
 */
export function parsePhone(raw: string, field: string): string {
  const digits = (raw ?? '').replace(/\D/g, '');

  if (!digits) {
    throw new Error(`${field}: no phone number`);
  }

  const local = digits.startsWith('237') ? digits.slice(3) : digits;
  if (local.length === 9) return local;

  // Anything else is read as an international number and left whole. Shorter
  // than eight digits is a typo, not a country.
  if (digits.length >= 8 && digits.length <= 15) return digits;

  throw new Error(`${field}: "${raw}" is not a phone number`);
}

/**
 * The number a WhatsApp message is addressed to: a country code and then the
 * line. Cameroonian numbers are stored without one, so it is added back; a
 * number that already carries its own is left alone.
 */
export function whatsappForm(phone: string): string {
  return phone.length === 9 ? `237${phone}` : phone;
}

/**
 * How a payment is recognised on a second run.
 *
 * The sheet gives payments no id of their own, so the key is what actually
 * distinguishes two payments against one order: the day and the amount. Two
 * identical amounts taken on the same day against the same order are one
 * payment entered twice — which is what the second run must not import again.
 */
export function paymentLegacyCode(
  orderCode: string,
  paidAt: Date,
  amount: number,
): string {
  return `${orderCode}:${paidAt.toISOString().slice(0, 10)}:${amount}`;
}
