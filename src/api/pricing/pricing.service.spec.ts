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
import { PricingModelEnum } from 'src/schema/order/order.dto';
import { PromoCode } from 'src/schema/promo/promo-code.schema';
import { PromoCodeUsage } from 'src/schema/promo/promo-code-usage.schema';
import { Setting, SettingKeys } from 'src/schema/settings/settings.schema';
import { Subscription } from 'src/schema/subscription/subscription.schema';
import { QuoteDto, QuoteLineDto } from './dto/quote.dto';
import { PricingService } from './pricing.service';

type PriceRow = { unitPrice: number; currencyId: Types.ObjectId } | null;

describe('PricingService', () => {
  let service: PricingService;
  let priceModel: { findOne: jest.Mock };
  let promoCodeModel: { findOne: jest.Mock };
  let promoUsageModel: { countDocuments: jest.Mock };
  let settingModel: { findOne: jest.Mock };
  let subscriptionModel: { findOne: jest.Mock };

  const currencyId = new Types.ObjectId();
  const oid = () => new Types.ObjectId().toString();

  const setResolver = (resolver: (q: Record<string, unknown>) => PriceRow) => {
    priceModel.findOne.mockImplementation((q: Record<string, unknown>) => ({
      sort: () => Promise.resolve(resolver(q)),
    }));
  };

  const line = (over: Partial<QuoteLineDto> = {}): QuoteLineDto => ({
    itemId: oid(),
    serviceTypeId: oid(),
    quantity: 1,
    ...over,
  });

  // Rates: perKgRate + overageRate both 1000.
  const rate = (key: string) => (key ? { value: 1000 } : null);

  beforeEach(async () => {
    priceModel = { findOne: jest.fn() };
    promoCodeModel = { findOne: jest.fn() };
    promoUsageModel = { countDocuments: jest.fn().mockResolvedValue(0) };
    settingModel = {
      findOne: jest
        .fn()
        .mockImplementation((q: { key: string }) =>
          Promise.resolve(rate(q.key)),
        ),
    };
    subscriptionModel = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: AppUtilService, useValue: { parseSortParam: () => ({}) } },
        {
          provide: REQUEST,
          useValue: {
            data: { platform: 'WEB' },
            user: { phone: '600', userId: oid(), ability: { can: () => true } },
          },
        },
        { provide: getModelToken(Price.name), useValue: priceModel },
        { provide: getModelToken(Item.name), useValue: {} },
        { provide: getModelToken(Currency.name), useValue: {} },
        { provide: getModelToken(ServiceType.name), useValue: {} },
        { provide: getModelToken(PromoCode.name), useValue: promoCodeModel },
        {
          provide: getModelToken(PromoCodeUsage.name),
          useValue: promoUsageModel,
        },
        { provide: getModelToken(Setting.name), useValue: settingModel },
        {
          provide: getModelToken(Subscription.name),
          useValue: subscriptionModel,
        },
      ],
    }).compile();

    service = await module.resolve<PricingService>(PricingService);
  });

  describe('PER_PIECE', () => {
    it('sums catalog line totals', async () => {
      setResolver(() => ({ unitPrice: 1500, currencyId }));
      const res = await service.priceOrder({
        pricingModel: PricingModelEnum.PER_PIECE,
        items: [line({ quantity: 2 }), line({ quantity: 1 })],
      } as QuoteDto);
      expect(res.subtotal).toBe(1500 * 3);
      expect(res.lines).toHaveLength(2);
      expect(res.total).toBe(4500);
    });

    it('prefers a per-office price, falling back to company-wide', async () => {
      setResolver((q) =>
        q.officeId
          ? { unitPrice: 1200, currencyId }
          : { unitPrice: 2000, currencyId },
      );
      const withOffice = await service.priceOrder({
        pricingModel: PricingModelEnum.PER_PIECE,
        officeId: oid(),
        items: [line()],
      } as QuoteDto);
      expect(withOffice.subtotal).toBe(1200);

      setResolver((q) => (q.officeId ? null : { unitPrice: 2000, currencyId }));
      const fallback = await service.priceOrder({
        pricingModel: PricingModelEnum.PER_PIECE,
        officeId: oid(),
        items: [line()],
      } as QuoteDto);
      expect(fallback.subtotal).toBe(2000);
    });

    it('throws PRICE_NOT_FOUND when no price exists', async () => {
      setResolver(() => null);
      await expect(
        service.priceOrder({
          pricingModel: PricingModelEnum.PER_PIECE,
          items: [line()],
        } as QuoteDto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('PER_KG', () => {
    it('prices by weight × perKgRate and zeroes garment lines', async () => {
      const res = await service.priceOrder({
        pricingModel: PricingModelEnum.PER_KG,
        totalWeightKg: 7,
        items: [line({ quantity: 3 })],
      } as QuoteDto);
      expect(res.subtotal).toBe(7000);
      expect(res.lines[0].unitPrice).toBe(0);
      expect(res.lines[0].lineTotal).toBe(0);
      expect(settingModel.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ key: SettingKeys.perKgRate }),
      );
    });
  });

  describe('SUBSCRIPTION', () => {
    it('charges only the overage beyond remaining quota', async () => {
      subscriptionModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        remainingQuota: 5,
      });
      // weight 8, quota 5 → overage 3 × 1000 = 3000; quotaConsumed 5
      const res = await service.priceOrder({
        pricingModel: PricingModelEnum.SUBSCRIPTION,
        customerId: oid(),
        totalWeightKg: 8,
      } as QuoteDto);
      expect(res.subtotal).toBe(3000);
      expect(res.quotaConsumedKg).toBe(5);
      expect(res.subscriptionId).not.toBeNull();
    });

    it('is free when weight is within quota', async () => {
      subscriptionModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        remainingQuota: 20,
      });
      const res = await service.priceOrder({
        pricingModel: PricingModelEnum.SUBSCRIPTION,
        customerId: oid(),
        totalWeightKg: 8,
      } as QuoteDto);
      expect(res.subtotal).toBe(0);
      expect(res.quotaConsumedKg).toBe(8);
    });

    it('rejects with NO_ACTIVE_SUBSCRIPTION when none is active', async () => {
      subscriptionModel.findOne.mockResolvedValue(null);
      await expect(
        service.priceOrder({
          pricingModel: PricingModelEnum.SUBSCRIPTION,
          customerId: oid(),
          totalWeightKg: 8,
        } as QuoteDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('FREE', () => {
    it('is always zero', async () => {
      const res = await service.priceOrder({
        pricingModel: PricingModelEnum.FREE,
        items: [line()],
      } as QuoteDto);
      expect(res.subtotal).toBe(0);
      expect(res.total).toBe(0);
    });
  });

  describe('discounts', () => {
    beforeEach(() => setResolver(() => ({ unitPrice: 2000, currencyId })));

    const withPromo = (over: Partial<Record<string, unknown>> = {}) =>
      promoCodeModel.findOne.mockResolvedValue({
        _id: new Types.ObjectId(),
        promoCodeName: 'SAVE',
        discountType: RewardTypeEnum.FLAT,
        discountValue: 500,
        minOrderValue: 0,
        applicableServiceTypeIds: [],
        perCustomerLimit: 0,
        usedCount: 0,
        ...over,
      });

    it('subtracts both manual and promo discounts', async () => {
      withPromo({ discountValue: 500 });
      // subtotal 2000*2 = 4000; manual 1000; promo 500 → total 2500
      const res = await service.priceOrder({
        pricingModel: PricingModelEnum.PER_PIECE,
        items: [line({ quantity: 2 })],
        manualDiscount: 1000,
        promoCode: 'SAVE',
      } as QuoteDto);
      expect(res.subtotal).toBe(4000);
      expect(res.manualDiscount).toBe(1000);
      expect(res.promoDiscount).toBe(500);
      expect(res.total).toBe(2500);
    });

    it('floors total at zero when discounts exceed subtotal', async () => {
      withPromo({ discountValue: 1500 });
      const res = await service.priceOrder({
        pricingModel: PricingModelEnum.PER_PIECE,
        items: [line({ quantity: 1 })],
        manualDiscount: 1000,
        promoCode: 'SAVE',
      } as QuoteDto);
      // subtotal 2000; manual 1000 + promo capped at 2000 → total 0
      expect(res.total).toBe(0);
    });

    it('applies a floored percentage promo', async () => {
      withPromo({ discountType: RewardTypeEnum.PERCENTAGE, discountValue: 15 });
      const res = await service.priceOrder({
        pricingModel: PricingModelEnum.PER_PIECE,
        items: [line({ quantity: 3 })],
        promoCode: 'SAVE',
      } as QuoteDto);
      // 6000 * 15% = 900
      expect(res.promoDiscount).toBe(900);
    });

    it('enforces the per-customer promo limit', async () => {
      withPromo({ perCustomerLimit: 1 });
      promoUsageModel.countDocuments.mockResolvedValue(1);
      await expect(
        service.priceOrder({
          pricingModel: PricingModelEnum.PER_PIECE,
          items: [line({ quantity: 1 })],
          customerId: oid(),
          promoCode: 'SAVE',
        } as QuoteDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a promo below minOrderValue', async () => {
      withPromo({ minOrderValue: 100000 });
      await expect(
        service.priceOrder({
          pricingModel: PricingModelEnum.PER_PIECE,
          items: [line({ quantity: 1 })],
          promoCode: 'SAVE',
        } as QuoteDto),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
