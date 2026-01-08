import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Customer } from 'src/schema/user/customer.schema';

@Injectable()
export class CodeGeneratorService {
  constructor(
    @InjectModel(Customer.name) private readonly customerModel: Model<Customer>,
  ) {}

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
}
