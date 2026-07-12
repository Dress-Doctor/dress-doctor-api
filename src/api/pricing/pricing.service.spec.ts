import { BadRequestException, NotFoundException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { RewardTypeEnum } from 'src/schema/affiliate/affiliate.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { Currency } from 'src/schema/catalog/currency.schema';
import { Item } from 'src/schema/catalog/item.schema';
import { Price } from 'src/schema/catalog/price.schema';
import { ServiceType } from 'src/schema/catalog/service-type.schema';
import { PromoCode } from 'src/schema/promo/promo-code.schema';
import { QuoteDto } from './dto/quote.dto';
import { PricingService } from './pricing.service';

type PriceRow = { unitPrice: number; currencyId: Types.ObjectId } | null;

describe('PricingService', () => {
  let service: PricingService;
  let priceModel: { findOne: jest.Mock };
  let promoCodeModel: { findOne: jest.Mock };

  const currencyId = new Types.ObjectId();
  const item = () => new Types.ObjectId().toString();
  const stype = () => new Types.ObjectId().toString();

  // priceModel.findOne(query).sort() → resolver(query)
  const setResolver = (resolver: (q: Record<string, unknown>) => PriceRow) => {
    priceModel.findOne.mockImplementation((q: Record<string, unknown>) => ({
      sort: () => Promise.resolve(resolver(q)),
    }));
  };

  const line = (over: Partial<QuoteDto['items'][0]> = {}) => ({
    itemId: item(),
    serviceTypeId: stype(),
    quantity: 1,
    ...over,
  });

  beforeEach(async () => {
    priceModel = { findOne: jest.fn() };
    promoCodeModel = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: AppUtilService, useValue: { parseSortParam: () => ({}) } },
        {
          provide: REQUEST,
          useValue: {
            data: { platform: 'WEB' },
            user: {
              phone: '600',
              userId: item(),
              ability: { can: () => true },
            },
          },
        },
        { provide: getModelToken(Price.name), useValue: priceModel },
        { provide: getModelToken(Item.name), useValue: {} },
        { provide: getModelToken(Currency.name), useValue: {} },
        { provide: getModelToken(ServiceType.name), useValue: {} },
        { provide: getModelToken(PromoCode.name), useValue: promoCodeModel },
      ],
    }).compile();

    service = await module.resolve<PricingService>(PricingService);
  });

  describe('quote pricing', () => {
    it('sums per-line totals into a subtotal', async () => {
      setResolver(() => ({ unitPrice: 1500, currencyId }));

      const res = await service.quote({
        items: [line({ quantity: 2 }), line({ quantity: 1 })],
      } as QuoteDto);

      expect(res.lines).toHaveLength(2);
      expect(res.subtotal).toBe(1500 * 2 + 1500);
      expect(res.total).toBe(res.subtotal);
      expect(res.currencyId).toEqual(currencyId);
    });

    it('prefers a per-office price over the company-wide default', async () => {
      setResolver((q) =>
        q.officeId
          ? { unitPrice: 1200, currencyId }
          : { unitPrice: 2000, currencyId },
      );

      const res = await service.quote({
        officeId: new Types.ObjectId().toString(),
        items: [line({ quantity: 1 })],
      } as QuoteDto);

      expect(res.subtotal).toBe(1200);
    });

    it('falls back to the company-wide price when no office price exists', async () => {
      setResolver((q) => (q.officeId ? null : { unitPrice: 2000, currencyId }));

      const res = await service.quote({
        officeId: new Types.ObjectId().toString(),
        items: [line({ quantity: 1 })],
      } as QuoteDto);

      expect(res.subtotal).toBe(2000);
    });

    it('throws PRICE_NOT_FOUND when neither office nor company price exists', async () => {
      setResolver(() => null);

      await expect(
        service.quote({ items: [line()] } as QuoteDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('promo application', () => {
    const withPromo = (over: Partial<Record<string, unknown>> = {}) =>
      promoCodeModel.findOne.mockResolvedValue({
        promoCodeName: 'SAVE',
        discountType: RewardTypeEnum.FLAT,
        discountValue: 500,
        minOrderValue: 0,
        applicableServiceTypeIds: [],
        usedCount: 0,
        ...over,
      });

    beforeEach(() => setResolver(() => ({ unitPrice: 2000, currencyId })));

    it('applies a FLAT discount', async () => {
      withPromo({ discountType: RewardTypeEnum.FLAT, discountValue: 500 });

      const res = await service.quote({
        promoCode: 'SAVE',
        items: [line({ quantity: 1 })],
      } as QuoteDto);

      expect(res.discount).toBe(500);
      expect(res.total).toBe(1500);
      expect(res.promoApplied).toEqual({ code: 'SAVE', discount: 500 });
    });

    it('applies a floored PERCENTAGE discount', async () => {
      withPromo({ discountType: RewardTypeEnum.PERCENTAGE, discountValue: 15 });

      // subtotal 2000 * 3 = 6000; 15% = 900
      const res = await service.quote({
        promoCode: 'SAVE',
        items: [line({ quantity: 3 })],
      } as QuoteDto);

      expect(res.discount).toBe(900);
    });

    it('caps a FLAT discount at the subtotal', async () => {
      withPromo({ discountType: RewardTypeEnum.FLAT, discountValue: 999999 });

      const res = await service.quote({
        promoCode: 'SAVE',
        items: [line({ quantity: 1 })],
      } as QuoteDto);

      expect(res.discount).toBe(2000);
      expect(res.total).toBe(0);
    });

    it('rejects when subtotal is below minOrderValue', async () => {
      withPromo({ minOrderValue: 10000 });

      await expect(
        service.quote({
          promoCode: 'SAVE',
          items: [line({ quantity: 1 })],
        } as QuoteDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an expired promo', async () => {
      withPromo({ expiresAt: new Date(Date.now() - 1000) });

      await expect(
        service.quote({
          promoCode: 'SAVE',
          items: [line({ quantity: 1 })],
        } as QuoteDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an unknown promo code', async () => {
      promoCodeModel.findOne.mockResolvedValue(null);

      await expect(
        service.quote({
          promoCode: 'NOPE',
          items: [line({ quantity: 1 })],
        } as QuoteDto),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
