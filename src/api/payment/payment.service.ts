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
import { CaslActionsDto, CaslSubjectsDto } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { Currency } from 'src/schema/catalog/currency.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { OrderPaymentStatusEnum } from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { PaymentMethod } from 'src/schema/payment/payment-method.schema';
import { PaymentType } from 'src/schema/payment/payment-type.schema';
import { PaymentTypeEnum } from 'src/schema/payment/payment.dto';
import { Payment } from 'src/schema/payment/payment.schema';
import { OrderParamsDto } from '../order/dto/create-order-item.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { FindPaymentDto } from './dto/find-payment.dto';

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

    const skip = (page - 1) * size;
    const sort = this.appUtilService.parseSortParam(query.sort);
    const total = await this.paymentModel.countDocuments(whereClause);

    const payments = await this.paymentModel
      .find(whereClause)
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

    // Validate order exists and is in appropriate status for payment
    const orderId = new Types.ObjectId(param.orderId);
    const order = await this.orderModel.findById(orderId).populate<{
      orderStatusId: OrderStatus;
    }>({ model: OrderStatus.name, path: 'orderStatusId' });

    if (!order) {
      this.logger.error(`${base} invalid order id ${param.orderId}`);
      throw new NotFoundException('Order not found');
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

    // Check if this is a refund
    const isRefund =
      paymentType.paymentTypeName === PaymentTypeEnum.REFUND.toString();

    // Prevent refunds on orders with no prior payments
    if (isRefund && order.amountPaid === 0) {
      this.logger.error(
        `${base} cannot refund payment on order ${order.orderCode} with no prior payments`,
      );
      throw new BadRequestException(
        'Cannot refund payment on an order with no prior payments. First payment cannot be a refund.',
      );
    }

    const currency = await this.currencyModel.findOne({ isoCode: 'XAF' });
    if (!currency) {
      this.logger.error(`${base} XAF currency not found`);
      throw new NotFoundException('XAF currency not found');
    }

    // Create payment
    const userId = new Types.ObjectId(this.req.user.userId);
    const payment = new this.paymentModel({
      orderId,
      note: data.note,
      paidAt: new Date(),
      amount: data.amount,
      currencyId: currency.id,
      paymentTypeId: paymentTypeId,
      paymentMethodId: paymentMethod._id,
      transactionRef: data.transactionRef,
    });

    payment.$locals.changedBy = userId;
    await payment.save();

    // Update order payment tracking fields
    const newAmountPaid = isRefund
      ? order.amountPaid - data.amount
      : order.amountPaid + data.amount;
    const newBalanceDue = order.totalAmount - newAmountPaid;

    // Determine payment status
    let paymentStatusEnum: OrderPaymentStatusEnum;
    if (newBalanceDue <= 0) {
      paymentStatusEnum = OrderPaymentStatusEnum.PAID;
    } else if (newAmountPaid > 0 && newBalanceDue > 0) {
      paymentStatusEnum = OrderPaymentStatusEnum.PARTIAL;
    } else {
      paymentStatusEnum = OrderPaymentStatusEnum.UNPAID;
    }

    // Update order
    await this.orderModel.findOneAndUpdate(
      { _id: orderId },
      {
        amountPaid: newAmountPaid,
        paymentStatus: paymentStatusEnum,
        balanceDue: Math.max(0, newBalanceDue),
      },
      { context: { changedBy: userId }, upsert: true, new: true } as never,
    );

    this.logger.log(
      `${base} has successfully created payment for order ${order.orderCode}`,
    );
    return 'Payment created successfully';
  }
}
