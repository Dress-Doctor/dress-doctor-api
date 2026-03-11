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
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { OrderPaymentStatusEnum } from 'src/schema/order/order.dto';
import { Order } from 'src/schema/order/order.schema';
import { PaymentType } from 'src/schema/payment/payment-type.schema';
import { PaymentTypeEnum } from 'src/schema/payment/payment.dto';
import { Payment } from 'src/schema/payment/payment.schema';
import { OrderParamsDto } from '../order/dto/create-order-item.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { Currency } from 'src/schema/catalog/currency.schema';
import { PaymentMethod } from 'src/schema/payment/payment-method.schema';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,

    @InjectModel(PaymentType.name)
    private readonly paymentTypeModel: Model<PaymentType>,

    @InjectModel(Order.name) private readonly orderModel: Model<Order>,

    @Inject(REQUEST) private readonly req: AppRequestWithUser,

    @InjectModel(PaymentMethod.name)
    private readonly paymentMethodModel: Model<PaymentMethod>,

    @InjectModel(Currency.name) private readonly currencyModel: Model<Currency>,
  ) {}

  async createPaymentForOrder(param: OrderParamsDto, data: CreatePaymentDto) {
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

  async getPaymentsForOrder(
    orderId: string,
    skip = 0,
    limit = 10,
  ): Promise<{
    data: Payment[];
    total: number;
    nextPage: number;
  }> {
    const id = new Types.ObjectId(orderId);

    // Validate order exists
    const order = await this.orderModel.findById(id);
    if (!order) {
      throw new NotFoundException('Order not found');
    }

    const payments = await this.paymentModel
      .find({ orderId: id })
      .sort({ paidAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    const total = await this.paymentModel.countDocuments({ orderId: id });

    return {
      data: payments,
      total,
      nextPage: Math.ceil((skip + limit) / limit),
    };
  }

  async refundPayment(
    orderId: string,
    paymentId: string,
    refundDto: RefundPaymentDto,
  ): Promise<Payment | null> {
    const platform = this.req.data.platform;
    const { phone } = this.req.user;
    const base = `[${platform}] ${phone}`;

    const paymentObjectId = new Types.ObjectId(paymentId);
    const orderObjectId = new Types.ObjectId(orderId);

    // Validate payment exists and belongs to order
    const payment = await this.paymentModel.findOne({
      _id: paymentObjectId,
      orderId: orderObjectId,
    });

    if (!payment) {
      this.logger.error(
        `${base} payment ${paymentId} not found for order ${orderId}`,
      );
      throw new NotFoundException('Payment not found for this order');
    }

    // Get refunded payment status
    const refundedStatus = await this.paymentTypeModel.findOne({
      name: 'refunded',
    });
    if (!refundedStatus) {
      this.logger.error(`${base} refunded payment status not found`);
      throw new BadRequestException('Refund status not found');
    }

    // Update payment status to refunded
    const updatedPayment = await this.paymentModel.findByIdAndUpdate(
      paymentObjectId,
      {
        paymentStatusId: refundedStatus._id,
        note:
          refundDto.note ||
          `Refund: ${refundDto.reason || 'No reason provided'}`,
      },
      { new: true },
    );

    return updatedPayment;
  }
}
