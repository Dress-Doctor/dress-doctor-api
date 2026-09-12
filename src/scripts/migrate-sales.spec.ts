import {
  OrderItemConditionEnum,
  PricingModelEnum,
} from 'src/schema/order/order.dto';
import { PaymentPeriodEnum } from 'src/schema/payment/payment.dto';
import {
  normalisePaymentMethod,
  parseCondition,
  parseCsv,
  parseDebtType,
  parseMoney,
  parseNumber,
  parsePhone,
  parsePricingModel,
  parseSheetDate,
  paymentLegacyCode,
} from './migrate-sales.parse';
import { parseArgs, staffKey } from './migrate-sales';

describe('reading the 2026 Sales sheet', () => {
  describe('parseCsv', () => {
    it('keys each row by its header, lower-cased', () => {
      const rows = parseCsv('Order ID,Amount Paid\nOR-0001,3000\n');

      expect(rows).toEqual([{ 'order id': 'OR-0001', 'amount paid': '3000' }]);
    });

    it('keeps a comma that sits inside a quoted field', () => {
      const rows = parseCsv(
        'Customer Code,Pickup Address\nCU-0001,"STARDE 105, BONADALE"\n',
      );

      expect(rows[0]['pickup address']).toBe('STARDE 105, BONADALE');
    });

    it('reads a quoted field that spans lines, and doubled quotes inside it', () => {
      const rows = parseCsv('Notes\n"said ""tomorrow"",\nnot today"\n');

      expect(rows[0]['notes']).toBe('said "tomorrow",\nnot today');
    });

    it('drops the empty rows a sheet’s formatting leaves behind', () => {
      const rows = parseCsv('Order ID,Amount\nOR-0001,3000\n,\n,\n');

      expect(rows).toHaveLength(1);
    });
  });

  describe('parseMoney', () => {
    it('reads a thousands separator as a separator, not a decimal point', () => {
      expect(parseMoney('22,500', 'Total')).toBe(22500);
      expect(parseMoney('3 000', 'Total')).toBe(3000);
    });

    it('treats a blank as nothing paid', () => {
      expect(parseMoney('', 'Total')).toBe(0);
    });

    it('refuses a fraction rather than rounding money nobody agreed', () => {
      expect(() => parseMoney('3.5', 'Total')).toThrow(/whole number/);
    });

    it('refuses text', () => {
      expect(() => parseMoney('n/a', 'Total')).toThrow(/not a number/);
    });
  });

  describe('parseSheetDate', () => {
    it('reads the sheet’s day-first order', () => {
      const date = parseSheetDate('03-04-2026', 'Date Received');

      // The 3rd of April. Read the American way it would be the 4th of March,
      // and a month of trade would land in the wrong month.
      expect(date?.toISOString().slice(0, 10)).toBe('2026-04-03');
    });

    it('lands on the same calendar day for a reader in Douala', () => {
      const date = parseSheetDate('26-02-2026', 'Date Received');

      expect(date?.getUTCHours()).toBe(12);
    });

    it('is undefined for a blank, which many columns are', () => {
      expect(parseSheetDate('', 'Actual Delivery')).toBeUndefined();
    });

    it('refuses a day that never happened', () => {
      expect(() => parseSheetDate('31-04-2026', 'Date')).toThrow(
        /not a real date/,
      );
    });
  });

  describe('parsePricingModel', () => {
    it.each([
      ['⚖️ Wash Per KG', PricingModelEnum.PER_KG],
      ['🧺 Wash Per Piece', PricingModelEnum.PER_PIECE],
      ['🎟 Subscriptions', PricingModelEnum.SUBSCRIPTION],
      ['Free', PricingModelEnum.FREE],
    ])('reads %s', (label, expected) => {
      expect(parsePricingModel(label)).toBe(expected);
    });

    it('still reads it when the export mangled the emoji', () => {
      expect(parsePricingModel('ð§º Wash Per Piece')).toBe(
        PricingModelEnum.PER_PIECE,
      );
    });

    it('refuses a service type it does not know', () => {
      expect(() => parsePricingModel('Ironing only')).toThrow(/pricing model/);
    });
  });

  describe('the smaller readings', () => {
    it('maps the sheet’s payment method onto the seeded row’s name', () => {
      expect(normalisePaymentMethod('MTN Mobile Money')).toBe('MTN Momo');
      expect(normalisePaymentMethod('Cash')).toBe('Cash');
    });

    it('treats a blank condition as nothing noted', () => {
      expect(parseCondition('')).toBe(OrderItemConditionEnum.NORMAL);
      expect(parseCondition('Dirty')).toBe(OrderItemConditionEnum.DIRTY);
    });

    it('reads Debt Type as the ageing it stands for', () => {
      expect(parseDebtType('Current')).toBe(PaymentPeriodEnum.CURRENT);
      expect(parseDebtType('Prior')).toBe(PaymentPeriodEnum.PRIOR);
      expect(parseDebtType('')).toBeUndefined();
    });

    it('reads a Cameroonian phone with or without its country code', () => {
      expect(parsePhone('675104631', 'Phone')).toBe('675104631');
      expect(parsePhone('+237 675 104 631', 'Phone')).toBe('675104631');
    });

    it('keeps a foreign number whole rather than cutting it to nine digits', () => {
      // The sheet has a London number. Trimmed to nine digits it would read as
      // a Douala line belonging to nobody.
      expect(parsePhone('442077903847', 'Phone')).toBe('442077903847');
    });

    it('refuses a blank, which is how an account is addressed', () => {
      expect(() => parsePhone('', 'Phone')).toThrow(/no phone number/);
    });

    it('refuses something too short to be any country’s number', () => {
      expect(() => parsePhone('6751', 'Phone')).toThrow(/not a phone number/);
    });

    it('counts pieces and kilos without demanding whole numbers', () => {
      expect(parseNumber('3', 'Weight')).toBe(3);
      expect(parseNumber('2.5', 'Weight')).toBe(2.5);
    });
  });

  describe('recognising a row on a second run', () => {
    it('tells two payments on one order apart by day and amount', () => {
      const day = new Date(Date.UTC(2026, 1, 27, 12));

      expect(paymentLegacyCode('OR-0001', day, 3000)).toBe(
        'OR-0001:2026-02-27:3000',
      );
      expect(paymentLegacyCode('OR-0001', day, 1500)).not.toBe(
        paymentLegacyCode('OR-0001', day, 3000),
      );
    });

    it('reads both spellings of one person as the same member of staff', () => {
      expect(staffKey('Cynthia Ndasi')).toBe(staffKey('Ndasi Cynthia'));
      expect(staffKey('Njang Naomi ')).not.toBe(staffKey('Cynthia Ndasi'));
    });
  });

  describe('parseArgs', () => {
    const files = [
      '--customers',
      'c.csv',
      '--orders',
      'o.csv',
      '--items',
      'i.csv',
      '--payments',
      'p.csv',
      '--staff',
      's.csv',
    ];

    it('writes nothing unless asked outright', () => {
      expect(parseArgs(files).commit).toBe(false);
      expect(parseArgs([...files, '--commit']).commit).toBe(true);
    });

    it('files the trade under 105 Bonadale unless told otherwise', () => {
      expect(parseArgs(files).officeSlug).toBe('105-bonadale');
      expect(parseArgs([...files, '--office', 'bonabo']).officeSlug).toBe(
        'bonabo',
      );
    });

    it('names every missing file at once, not one run at a time', () => {
      expect(() => parseArgs(['--customers', 'c.csv'])).toThrow(
        '--orders <path>, --items <path>, --payments <path>, --staff <path> are required',
      );
    });

    it('counts a flag whose value is the next flag as missing', () => {
      expect(() => parseArgs([...files.slice(2), '--customers'])).toThrow(
        '--customers <path> is required',
      );
    });
  });
});
