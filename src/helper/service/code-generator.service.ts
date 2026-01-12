import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import * as bcrypt from 'bcrypt';
import { Chance } from 'chance';
import * as crypto from 'crypto';
import { Model } from 'mongoose';
import { Customer } from 'src/schema/user/customer.schema';
import { OtpCode } from 'src/schema/user/otp-code.schema';

@Injectable()
export class CodeGeneratorService {
  private readonly SALT_ROUND = process.env.SALT as string;

  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
    @InjectModel(OtpCode.name) private readonly otpModel: Model<OtpCode>,
  ) {}

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

    function generateCode(): string {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const length = 8;

      let code = '';
      for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * chars.length);
        code += chars[randomIndex];
      }
      return code;
    }

    do {
      code = generateCode();
      const doc = await this.customerModel.exists({ referralCode: code });
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

  async generateOtpCode() {
    let code: string;
    let exists: boolean;

    const min = 100000;
    const max = 999999;
    do {
      code = (Math.floor(Math.random() * (max - min + 1)) + min).toString();
      const doc = await this.otpModel.exists({ code });
      exists = doc ? true : false;
    } while (exists);

    return code;
  }
}
