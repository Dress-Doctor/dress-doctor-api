import {
  Injectable,
  Inject,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { REQUEST } from '@nestjs/core';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { RefundPaymentDto } from './dto/refund-payment.dto';
import { Payment } from 'src/schema/payment/payment.schema';
import { PaymentStatus } from 'src/schema/payment/payment-status.schema';
import { Order } from 'src/schema/order/order.schema';
import { OrderPaymentStatusEnum } from 'src/schema/order/order.dto';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { OrderParamsDto } from '../order/dto/create-order-item.dto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,
    @InjectModel(PaymentStatus.name)
    private readonly paymentStatusModel: Model<PaymentStatus>,
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
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

    // Validate payment status exists
    const paymentStatusId = new Types.ObjectId(data.paymentStatusId);
    const paymentStatus =
      await this.paymentStatusModel.findById(paymentStatusId);
    if (!paymentStatus) {
      this.logger.error(
        `${base} invalid payment status id ${data.paymentStatusId}`,
      );
      throw new BadRequestException('Invalid payment status id');
    }

    // Create payment
    const userId = new Types.ObjectId(this.req.user.userId);
    const payment = new this.paymentModel({
      orderId,
      note: data.note,
      paidAt: new Date(),
      amount: data.amount,
      paymentStatusId: paymentStatusId,
      transactionRef: data.transactionRef,
      currencyId: new Types.ObjectId(data.currencyId),
      paymentMethodId: new Types.ObjectId(data.paymentMethodId),
    });

    payment.$locals.changedBy = userId;
    await payment.save();

    // Update order payment tracking fields
    const newAmountPaid = order.amountPaid + data.amount;
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
    const refundedStatus = await this.paymentStatusModel.findOne({
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
