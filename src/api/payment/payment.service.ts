import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { scopeFilter } from 'src/helper/casl/casl-scope';
import { Currency } from 'src/schema/catalog/currency.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { OrderPaymentStatusEnum } from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { PaymentMethod } from 'src/schema/payment/payment-method.schema';
import { PaymentType } from 'src/schema/payment/payment-type.schema';
import { DebtTypeEnum, PaymentTypeEnum } from 'src/schema/payment/payment.dto';
import { Payment } from 'src/schema/payment/payment.schema';
import { OrderEvents, type OrderPaidEvent } from '../order/order.events';
import { computePaymentStatus, computeFlagged } from './payment-status.util';
import { OrderParamsDto } from '../order/dto/create-order-item.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { FindPaymentDto } from './dto/find-payment.dto';
import { PaymentEvents, type PaymentRecordedEvent } from './payment.events';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly appUtilService: AppUtilService,
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,

    @InjectModel(PaymentType.name)
    private readonly paymentTypeModel: Model<PaymentType>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,

    @Inject(REQUEST) private readonly req: AppRequestWithUser,

    @InjectModel(PaymentMethod.name)
    private readonly paymentMethodModel: Model<PaymentMethod>,

    @InjectModel(Currency.name) private readonly currencyModel: Model<Currency>,

    @InjectConnection() private readonly connection: Connection,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private can(action: CaslActionsDto, subject: CaslSubjectsDto) {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can(action, subject)) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} ${log} is`);
      throw new BadRequestException(`You are ${log}`);
    }
  }

  async findAll({ page, size, ...query }: FindPaymentDto) {
    this.can('READ', 'Payment');

    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const logBase = `[${platform}] ${phone}`;

    const whereClause: Record<string, unknown> = {};
    const orderId = query.orderId;
    if (orderId) whereClause['orderId'] = new Types.ObjectId(query.orderId);

    const paymentMethodId = query.paymentMethodId;
    if (paymentMethodId)
      whereClause['paymentMethodId'] = new Types.ObjectId(
        query.paymentMethodId,
      );

    const paymentTypeId = query.paymentTypeId;
    if (paymentTypeId)
      whereClause['paymentTypeId'] = new Types.ObjectId(query.paymentTypeId);

    // Auto-scope: office staff → their office's payments; customer → own.
    const scope = scopeFilter(this.req.user.ability, 'READ', 'Payment');
    const match = { ...whereClause, ...scope };

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);
    const total = await this.paymentModel.countDocuments(match);

    const payments = await this.paymentModel
      .find(match)
      .sort(sort)
      .skip(skip)
      .limit(size)
      .populate({ model: Order.name, path: 'orderId' })
      .populate({ model: PaymentType.name, path: 'paymentTypeId' })
      .populate({ model: PaymentMethod.name, path: 'paymentMethodId' })
      .exec();

    const totalPages = Math.ceil(total / size);
    const nextPage = page < totalPages ? page + 1 : null;

    this.logger.log(`${logBase} has successfully retrieve all payments`);
    return { total, data: payments, nextPage };
  }

  async createPaymentForOrder(param: OrderParamsDto, data: CreatePaymentDto) {
    this.can('CREATE', 'Payment');
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    // Validate order exists and is in the caller's payment scope — you can't
    // record a payment against another office's order by supplying its id. The
    // caller's Payment { officeId: '$office' } condition matches the order's
    // officeId; a global cashier is unrestricted.
    const orderId = new Types.ObjectId(param.orderId);
    const orderScope = scopeFilter(this.req.user.ability, 'CREATE', 'Payment');
    const order = await this.orderModel
      .findOne({ _id: orderId, ...orderScope })
      .populate<{
        orderStatusId: OrderStatus;
      }>({ model: OrderStatus.name, path: 'orderStatusId' });

    if (!order) {
      this.logger.error(
        `${base} invalid/out-of-scope order id ${param.orderId}`,
      );
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Order not found',
      });
    }

    // Check if order status allows payment (must be CONFIRMED or beyond)
    const orderStatus = order.orderStatusId;
    const statusName = orderStatus.orderStatusName;
    const disallowedStatuses = ['DRAFT', 'CANCELLED'];

    if (!statusName || disallowedStatuses.includes(statusName)) {
      this.logger.error(
        `${base} cannot create payment for order ${order.orderCode} with status ${statusName}`,
      );
      throw new BadRequestException(
        `Cannot create payment for order in ${statusName || 'unknown'} status. Order must be CONFIRMED or beyond.`,
      );
    }

    // Validate payment method exists
    const paymentMethodId = new Types.ObjectId(data.paymentMethodId);
    const paymentMethod =
      await this.paymentMethodModel.findById(paymentMethodId);
    if (!paymentMethod) {
      this.logger.error(
        `${base} invalid payment method id ${data.paymentMethodId}`,
      );
      throw new BadRequestException('Invalid payment method id');
    }

    // Validate payment type exists
    const paymentTypeId = new Types.ObjectId(data.paymentTypeId);
    const paymentType = await this.paymentTypeModel.findById(paymentTypeId);
    if (!paymentType) {
      this.logger.error(
        `${base} invalid payment type id ${data.paymentTypeId}`,
      );
      throw new BadRequestException('Invalid payment type id');
    }

    const isRefund =
      paymentType.paymentTypeName === PaymentTypeEnum.REFUND.toString();

    // Refunds are permissioned and can't precede any payment.
    if (isRefund) {
      this.can('manage', 'Payment');
      if (order.amountPaid === 0) {
        this.logger.error(
          `${base} cannot refund order ${order.orderCode} with no prior payments`,
        );
        throw new BadRequestException({
          code: 'REFUND_WITHOUT_PAYMENT',
          message: 'Cannot refund an order with no prior payments',
        });
      }
    }

    // Idempotency: a retried request carrying the same x-idempotency-key must
    // not double-count. Return the prior result instead of recording again.
    const idempotencyKey = this.getIdempotencyKey();
    if (idempotencyKey) {
      const existing = await this.paymentModel.findOne({ idempotencyKey });
      if (existing) {
        this.logger.log(`${base} idempotent replay for key ${idempotencyKey}`);
        return 'Payment already recorded';
      }
    }

    const currency = await this.currencyModel.findOne({ isoCode: 'XAF' });
    if (!currency) {
      this.logger.error(`${base} XAF currency not found`);
      throw new NotFoundException('XAF currency not found');
    }

    const userId = new Types.ObjectId(this.req.user.userId);
    const delta = isRefund ? -data.amount : data.amount;
    const newAmountPaid = order.amountPaid + delta;
    const newBalanceDue = Math.max(0, order.totalAmount - newAmountPaid);
    const paymentStatus = computePaymentStatus(
      newAmountPaid,
      order.totalAmount,
    );
    const flagged = computeFlagged(statusName, paymentStatus);

    // Record the payment and recompute the order's money in one transaction so a
    // retry/crash can't leave them inconsistent.
    let paymentId: Types.ObjectId | undefined;
    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        const [payment] = await this.paymentModel.create(
          [
            {
              orderId,
              customerId: order.customerId,
              officeId: this.req.data.officeId,
              note: data.note,
              paidAt: new Date(),
              amount: data.amount,
              debtType: data.debtType ?? DebtTypeEnum.CURRENT,
              currencyId: currency.id,
              paymentTypeId,
              paymentMethodId: paymentMethod._id,
              transactionRef: data.transactionRef,
              idempotencyKey,
              receivedBy: userId,
            },
          ],
          { session },
        );
        paymentId = payment._id;

        await this.orderModel.findOneAndUpdate(
          { _id: orderId },
          {
            amountPaid: newAmountPaid,
            balanceDue: newBalanceDue,
            paymentStatus,
            flagged,
          },
          { session, context: { changedBy: userId } } as never,
        );
      });
    } finally {
      await session.endSession();
    }

    // Emit after commit: payment.recorded always; order.paid when settled.
    const recorded: PaymentRecordedEvent = {
      paymentId: paymentId as Types.ObjectId,
      orderId,
      amount: data.amount,
      isRefund,
    };
    this.eventEmitter.emit(PaymentEvents.recorded, recorded);
    if (paymentStatus === OrderPaymentStatusEnum.PAID) {
      const paid: OrderPaidEvent = { orderId, customerId: order.customerId };
      this.eventEmitter.emit(OrderEvents.paid, paid);
    }

    this.logger.log(
      `${base} recorded payment for order ${order.orderCode} (${paymentStatus})`,
    );
    return 'Payment created successfully';
  }

  /** The x-idempotency-key request header, if present. */
  private getIdempotencyKey(): string | undefined {
    const raw = this.req.headers['x-idempotency-key'];
    return typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  }
}
