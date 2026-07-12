import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Chance } from 'chance';
import * as crypto from 'crypto';
import { Model } from 'mongoose';
import { Office } from 'src/schema/office/office.schema';
import { Order } from 'src/schema/order/order.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { Customer } from 'src/schema/user/customer.schema';

@Injectable()
export class CodeGeneratorService {
  private readonly SALT_ROUND = process.env.SALT as string;

  constructor(
    @InjectModel(Order.name) private readonly orderModel: Model<Order>,
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(Office.name) private readonly officeModel: Model<Office>,

    @InjectModel(PickupRequest.name)
    private readonly pickupRequestModel: Model<PickupRequest>,
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

  signOfficeLink(slug: string): string {
    return crypto
      .createHmac('sha256', process.env.DD_OFFICE_LINK_SECRET!)
      .update(slug)
      .digest('hex')
      .slice(0, 12);
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
