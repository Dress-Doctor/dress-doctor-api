import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Chance } from 'chance';
import * as crypto from 'crypto';
import { Model } from 'mongoose';
import { OfficeType } from 'src/schema/office/office-type.schema';
import { Office } from 'src/schema/office/office.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { Order } from 'src/schema/order/order.schema';
import { PaymentMethod } from 'src/schema/payment/payment-method.schema';
import { PaymentType } from 'src/schema/payment/payment-type.schema';
import { Payment } from 'src/schema/payment/payment.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';

@Injectable()
export class CodeGeneratorService {
  private readonly SALT_ROUND = process.env.SALT as string;

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(Office.name) private readonly officeModel: Model<Office>,

    @InjectModel(Payment.name) private readonly paymentModel: Model<Payment>,

    @InjectModel(PickupRequest.name)
    private readonly pickupRequestModel: Model<PickupRequest>,

    @InjectModel(User.name) private readonly userModel: Model<User>,

    @InjectModel(UserType.name)
    private readonly userTypeModel: Model<UserType>,

    @InjectModel(PickupStatus.name)
    private readonly pickupStatusModel: Model<PickupStatus>,

    @InjectModel(OrderStatus.name)
    private readonly orderStatusModel: Model<OrderStatus>,

    @InjectModel(OfficeType.name)
    private readonly officeTypeModel: Model<OfficeType>,

    @InjectModel(PaymentMethod.name)
    private readonly paymentMethodModel: Model<PaymentMethod>,

    @InjectModel(PaymentType.name)
    private readonly paymentTypeModel: Model<PaymentType>,
  ) {}

  private generateCode(len: number, prefix?: string) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    // removed confusing chars: 0,O,1,I

    let code = '';
    for (let i = 0; i < len; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      code += chars[randomIndex];
    }
    return prefix ? `${prefix}-${code}` : code;
  }

  /**
   * HMAC over `slug.exp` so office links expire — the expiry is part of the
   * signed payload and can't be tampered with. `exp` is a unix-ms timestamp.
   */
  signOfficeLink(slug: string, exp: number): string {
    const secret = process.env.DD_OFFICE_LINK_SECRET;
    if (!secret) throw new Error('DD_OFFICE_LINK_SECRET is not configured');
    return crypto
      .createHmac('sha256', secret)
      .update(`${slug}.${exp}`)
      .digest('hex');
  }

  /** Constant-time verification of a signed office link. */
  verifyOfficeLink(slug: string, exp: number, sig: string): boolean {
    const expected = this.signOfficeLink(slug, exp);
    const expectedBuf = Buffer.from(expected, 'utf8');
    const sigBuf = Buffer.from(sig, 'utf8');
    if (expectedBuf.length !== sigBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, sigBuf);
  }

  async generateReferralCode() {
    let code: string;
    let exists: boolean;

    do {
      code = this.generateCode(6);
      const doc = await this.customerModel.exists({ referralCode: code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }

  async generateOfficeCode() {
    let code: string;
    let exists: boolean;

    do {
      code = this.generateCode(4, 'OF');
      const doc = await this.officeModel.exists({ officeCode: code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }

  async generateCustomerCode() {
    let code: string;
    let exists: boolean;

    do {
      code = this.generateCode(6, 'CU');
      const doc = await this.customerModel.exists({ customerCode: code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }

  async generatePickupReference() {
    let code: string;
    let exists: boolean;

    do {
      code = this.generateCode(6, 'PU');
      const doc = await this.pickupRequestModel.exists({ reference: code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }

  async generatePaymentReference() {
    let code: string;
    let exists: boolean;

    do {
      code = this.generateCode(6, 'PY');
      const doc = await this.paymentModel.exists({ reference: code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }

  /**
   * The reference every user is addressed by (`US-8KQTMR`).
   *
   * Six characters rather than four: there are far more users than offices,
   * and the retry loop below is cheapest when collisions are rare.
   */
  async generateUserReference() {
    let code: string;
    let exists: boolean;

    do {
      code = this.generateCode(6, 'US');
      const doc = await this.userModel.exists({ reference: code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }

  /**
   * The reference every user-type row is addressed by. Reference data is
   * small and rarely written, so the same collision-retry loop as the rest is
   * more than enough.
   */
  async generateUserTypeReference() {
    let code: string;
    let exists: boolean;

    do {
      code = this.generateCode(6, 'UT');
      const doc = await this.userTypeModel.exists({ reference: code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }

  /** The reference every pickup-status row is addressed by. */
  async generatePickupStatusReference() {
    let code: string;
    let exists: boolean;

    do {
      code = this.generateCode(6, 'PS');
      const doc = await this.pickupStatusModel.exists({ reference: code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }

  /** The reference every order-status row is addressed by. */
  async generateOrderStatusReference() {
    let code: string;
    let exists: boolean;

    do {
      code = this.generateCode(6, 'OS');
      const doc = await this.orderStatusModel.exists({ reference: code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }

  /** The reference every office-type row is addressed by. */
  async generateOfficeTypeReference() {
    let code: string;
    let exists: boolean;

    do {
      code = this.generateCode(6, 'OT');
      const doc = await this.officeTypeModel.exists({ reference: code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }

  /** The reference every payment-method row is addressed by. */
  async generatePaymentMethodReference() {
    let code: string;
    let exists: boolean;

    do {
      code = this.generateCode(6, 'PM');
      const doc = await this.paymentMethodModel.exists({ reference: code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }

  /** The reference every payment-type row is addressed by. */
  async generatePaymentTypeReference() {
    let code: string;
    let exists: boolean;

    do {
      code = this.generateCode(6, 'PT');
      const doc = await this.paymentTypeModel.exists({ reference: code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }

  async generateOrderReference() {
    let code: string;
    let exists: boolean;

    do {
      code = this.generateCode(6, 'OR');
      const doc = await this.orderModel.exists({ orderCode: code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }

  async verifyHash(plain: string, hashed: string) {
    return await bcrypt.compare(plain, hashed);
  }

  async hashPlainText(plainPassword: string) {
    return await bcrypt.hash(plainPassword, this.SALT_ROUND);
  }

  async generateApiClient() {
    const chance = new Chance();
    const key: string = chance.hash({ length: 10 });

    const secret: string = chance.string({ length: 25 });
    const secretHash = await this.hashPlainText(secret);

    return { key, secretHash, secret };
  }
}
