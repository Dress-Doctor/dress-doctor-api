import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { RewardTypeEnum } from 'src/schema/affiliate/affiliate.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
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
import { SubscriptionStatusEnum } from 'src/schema/subscription/subscription.dto';
import { CreatePriceDto } from './dto/create-price.dto';
import { FindPriceDto } from './dto/find-price.dto';
import { QuoteDto } from './dto/quote.dto';

export interface QuoteLine {
  itemId: string;
  serviceTypeId: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface OrderPricing {
  pricingModel: PricingModelEnum;
  lines: QuoteLine[];
  subtotal: number;
  manualDiscount: number;
  promoDiscount: number;
  total: number;
  currencyId: Types.ObjectId | null;
  promoCodeId: Types.ObjectId | null;
  // Subscription bookkeeping for order creation to apply in its transaction.
  subscriptionId: Types.ObjectId | null;
  quotaConsumedKg: number;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(Price.name) private readonly priceModel: Model<Price>,
    @InjectModel(Item.name) private readonly itemModel: Model<Item>,
    @InjectModel(Currency.name) private readonly currencyModel: Model<Currency>,
    @InjectModel(ServiceType.name)
    private readonly serviceTypeModel: Model<ServiceType>,
    @InjectModel(PromoCode.name)
    private readonly promoCodeModel: Model<PromoCode>,
    @InjectModel(PromoCodeUsage.name)
    private readonly promoUsageModel: Model<PromoCodeUsage>,
    @InjectModel(Setting.name) private readonly settingModel: Model<Setting>,
    @InjectModel(Subscription.name)
    private readonly subscriptionModel: Model<Subscription>,
  ) {}

  private can(action: CaslActionsDto, subject: CaslSubjectsDto) {
    const { phone, ability } = this.req.user;
    if (!ability.can(action, subject)) {
      this.logger.error(`${phone} not authorized for ${action} ${subject}`);
      throw new BadRequestException(
        'You are not authorized to perform this action',
      );
    }
  }

  /** Read a numeric setting (global row). Throws if the rate isn't seeded. */
  private async getRate(key: string): Promise<number> {
    const setting = await this.settingModel.findOne({ key, officeId: null });
    if (!setting) {
      this.logger.error(`setting ${key} not configured`);
      throw new BadRequestException({
        code: 'SETTING_NOT_CONFIGURED',
        message: `Rate '${key}' is not configured`,
      });
    }
    return setting.value;
  }

  private async findActiveSubscription(customerId: Types.ObjectId) {
    return this.subscriptionModel.findOne({
      customerId,
      status: SubscriptionStatusEnum.ACTIVE,
    });
  }

  /**
   * Resolve the active unit price for (item, serviceType) at an office: a
   * per-office row wins; otherwise the company-wide (officeId: null) default.
   */
  private async resolvePrice(
    itemId: Types.ObjectId,
    serviceTypeId: Types.ObjectId,
    officeId?: Types.ObjectId,
  ): Promise<Price> {
    const base = {
      itemId,
      serviceTypeId,
      isActive: true,
      effectiveFrom: { $lte: new Date() },
    };

    if (officeId) {
      const officeSpecific = await this.priceModel
        .findOne({ ...base, officeId })
        .sort({ effectiveFrom: -1 });
      if (officeSpecific) return officeSpecific;
    }

    const companyWide = await this.priceModel
      .findOne({ ...base, officeId: null })
      .sort({ effectiveFrom: -1 });
    if (!companyWide) {
      throw new NotFoundException({
        code: 'PRICE_NOT_FOUND',
        message: 'No price configured for one of the items',
      });
    }
    return companyWide;
  }

  /** Build 0-priced QC lines for weight/quota/free models. */
  private qcLines(items: QuoteDto['items']): QuoteLine[] {
    return (items ?? []).map((i) => ({
      itemId: i.itemId,
      serviceTypeId: i.serviceTypeId,
      quantity: i.quantity,
      unitPrice: 0,
      lineTotal: 0,
    }));
  }

  /**
   * Server-authoritative order pricing, branched by pricing model. Read-only —
   * the caller (order creation) applies the returned quotaConsumedKg /
   * promoCodeId writes inside its own transaction. Both `/pricing/quote` and
   * order intake go through here so estimate and authoritative price agree.
   */
  async priceOrder(data: QuoteDto): Promise<OrderPricing> {
    const officeId = data.officeId
      ? new Types.ObjectId(data.officeId)
      : undefined;
    const weight = data.totalWeightKg ?? 0;

    let lines: QuoteLine[] = [];
    let subtotal = 0;
    let currencyId: Types.ObjectId | null = null;
    let subscriptionId: Types.ObjectId | null = null;
    let quotaConsumedKg = 0;

    switch (data.pricingModel) {
      case PricingModelEnum.PER_PIECE: {
        for (const line of data.items ?? []) {
          const price = await this.resolvePrice(
            new Types.ObjectId(line.itemId),
            new Types.ObjectId(line.serviceTypeId),
            officeId,
          );
          const lineTotal = price.unitPrice * line.quantity;
          subtotal += lineTotal;
          currencyId = price.currencyId;
          lines.push({
            itemId: line.itemId,
            serviceTypeId: line.serviceTypeId,
            quantity: line.quantity,
            unitPrice: price.unitPrice,
            lineTotal,
          });
        }
        break;
      }

      case PricingModelEnum.PER_KG: {
        // Guard: without this a forgotten weight silently prices to 0 (free
        // wash). Subscription with weight 0 is fine (fully covered, 0 overage).
        if (weight <= 0) {
          throw new BadRequestException({
            code: 'WEIGHT_REQUIRED',
            message: 'A total weight (kg) is required for Per KG pricing',
          });
        }
        const perKgRate = await this.getRate(SettingKeys.perKgRate);
        subtotal = weight * perKgRate;
        lines = this.qcLines(data.items);
        break;
      }

      case PricingModelEnum.SUBSCRIPTION: {
        if (!data.customerId) {
          throw new BadRequestException({
            code: 'CUSTOMER_REQUIRED',
            message: 'A customer is required for subscription pricing',
          });
        }
        const sub = await this.findActiveSubscription(
          new Types.ObjectId(data.customerId),
        );
        if (!sub) {
          throw new BadRequestException({
            code: 'NO_ACTIVE_SUBSCRIPTION',
            message: 'The customer has no active subscription',
          });
        }
        const overageRate = await this.getRate(SettingKeys.overageRate);
        quotaConsumedKg = Math.min(weight, sub.remainingQuota);
        const overage = Math.max(0, weight - sub.remainingQuota);
        subtotal = overage * overageRate;
        subscriptionId = sub._id;
        lines = this.qcLines(data.items);
        break;
      }

      case PricingModelEnum.FREE: {
        subtotal = 0;
        lines = this.qcLines(data.items);
        break;
      }
    }

    // Discounts: manual (staff) and promo (engine) both subtract; total floors
    // at 0 so an order can never go negative.
    const manualDiscount = data.manualDiscount ?? 0;
    let promoDiscount = 0;
    let promoCodeId: Types.ObjectId | null = null;
    if (data.promoCode) {
      const applied = await this.applyPromo(
        data.promoCode,
        subtotal,
        (data.items ?? []).map((i) => i.serviceTypeId),
        data.customerId,
      );
      promoDiscount = applied.discount;
      promoCodeId = applied.promoCodeId;
    }

    const total = Math.max(0, subtotal - manualDiscount - promoDiscount);

    return {
      pricingModel: data.pricingModel,
      lines,
      subtotal,
      manualDiscount,
      promoDiscount,
      total,
      currencyId,
      promoCodeId,
      subscriptionId,
      quotaConsumedKg,
    };
  }

  /** Estimate endpoint — same engine, no order created. */
  async quote(data: QuoteDto): Promise<OrderPricing> {
    this.can('READ', 'Item');
    return this.priceOrder(data);
  }

  /**
   * Validate a promo against the order and return the XAF discount + id. Enforces
   * window, total maxUsage, per-customer limit (when the customer is known),
   * min-order, and service-type applicability. Integer XAF, percentage floored,
   * capped at subtotal.
   */
  private async applyPromo(
    code: string,
    subtotal: number,
    lineServiceTypeIds: string[],
    customerId?: string,
  ): Promise<{ discount: number; promoCodeId: Types.ObjectId }> {
    const promo = await this.promoCodeModel.findOne({
      promoCodeName: code,
      isActive: true,
    });
    if (!promo) {
      throw new BadRequestException({
        code: 'INVALID_PROMO_CODE',
        message: 'The promo code is not valid',
      });
    }

    const now = new Date();
    if (promo.validFrom && promo.validFrom > now) {
      throw new BadRequestException({
        code: 'PROMO_NOT_ACTIVE',
        message: 'This promo code is not active yet',
      });
    }
    if (promo.expiresAt && promo.expiresAt < now) {
      throw new BadRequestException({
        code: 'PROMO_EXPIRED',
        message: 'This promo code has expired',
      });
    }
    if (promo.maxUsage && promo.usedCount >= promo.maxUsage) {
      throw new BadRequestException({
        code: 'PROMO_EXHAUSTED',
        message: 'This promo code has reached its usage limit',
      });
    }
    if (subtotal < promo.minOrderValue) {
      throw new BadRequestException({
        code: 'PROMO_MIN_ORDER_NOT_MET',
        message: `Order must be at least ${promo.minOrderValue} to use this code`,
      });
    }
    if (promo.applicableServiceTypeIds.length > 0) {
      const allowed = new Set(
        promo.applicableServiceTypeIds.map((id) => id.toString()),
      );
      const applies =
        lineServiceTypeIds.length > 0 &&
        lineServiceTypeIds.every((id) => allowed.has(id));
      if (!applies) {
        throw new BadRequestException({
          code: 'PROMO_NOT_APPLICABLE',
          message: 'This promo code does not apply to the selected services',
        });
      }
    }

    // Per-customer redemption cap (0 = unlimited); only enforceable when the
    // customer is known (order creation, or a quote that passes customerId).
    if (customerId && promo.perCustomerLimit > 0) {
      const used = await this.promoUsageModel.countDocuments({
        promoCodeId: promo._id,
        userId: new Types.ObjectId(customerId),
      });
      if (used >= promo.perCustomerLimit) {
        throw new BadRequestException({
          code: 'PROMO_CUSTOMER_LIMIT',
          message: 'You have already used this promo code the maximum times',
        });
      }
    }

    const raw =
      promo.discountType === RewardTypeEnum.PERCENTAGE
        ? Math.floor((subtotal * promo.discountValue) / 100)
        : promo.discountValue;

    return { discount: Math.min(raw, subtotal), promoCodeId: promo._id };
  }

  async createPrice(data: CreatePriceDto) {
    this.can('CREATE', 'Item');
    const actorId = new Types.ObjectId(this.req.user.userId);

    const itemId = new Types.ObjectId(data.itemId);
    const serviceTypeId = new Types.ObjectId(data.serviceTypeId);
    const currencyId = new Types.ObjectId(data.currencyId);
    const officeId = data.officeId ? new Types.ObjectId(data.officeId) : null;

    const [item, serviceType, currency] = await Promise.all([
      this.itemModel.exists({ _id: itemId }),
      this.serviceTypeModel.exists({ _id: serviceTypeId }),
      this.currencyModel.exists({ _id: currencyId }),
    ]);
    if (!item)
      throw new BadRequestException({
        code: 'INVALID_ITEM',
        message: 'Invalid item id',
      });
    if (!serviceType)
      throw new BadRequestException({
        code: 'INVALID_SERVICE_TYPE',
        message: 'Invalid service type id',
      });
    if (!currency)
      throw new BadRequestException({
        code: 'INVALID_CURRENCY',
        message: 'Invalid currency id',
      });

    // Append-only: deactivate the prior active price for this scope.
    await this.priceModel.updateMany(
      { itemId, serviceTypeId, officeId, isActive: true },
      { isActive: false },
    );

    const price = new this.priceModel({
      itemId,
      serviceTypeId,
      officeId,
      currencyId,
      unitPrice: data.unitPrice,
      effectiveFrom: data.effectiveFrom ?? new Date(),
    });
    price.$locals.changedBy = actorId;
    await price.save();
    return price;
  }

  async listPrices({ page, size, ...query }: FindPriceDto) {
    this.can('READ', 'Item');

    const where: Record<string, unknown> = {};
    if (query.itemId) where.itemId = new Types.ObjectId(query.itemId);
    if (query.serviceTypeId)
      where.serviceTypeId = new Types.ObjectId(query.serviceTypeId);
    if (query.officeId) where.officeId = new Types.ObjectId(query.officeId);

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);
    const total = await this.priceModel.countDocuments(where);
    const data = await this.priceModel
      .find(where)
      .sort(sort)
      .skip(skip)
      .limit(size);

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;
    return { total, data, nextPage };
  }
}
