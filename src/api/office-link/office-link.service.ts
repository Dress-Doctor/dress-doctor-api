import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Office } from 'src/schema/office/office.schema';

@Injectable()
export class OfficeLinkService {
  constructor(
    private readonly codeService: CodeGeneratorService,
    @InjectModel(Office.name) private readonly officeModel: Model<Office>,
  ) {}

  async validateOfficeLink(slug: string, sig: string, exp: string) {
    const expNum = Number(exp);
    if (!Number.isFinite(expNum)) {
      throw new ForbiddenException({
        code: 'INVALID_OFFICE_LINK',
        message: 'Invalid office link',
      });
    }

    if (expNum <= Date.now()) {
      throw new ForbiddenException({
        code: 'OFFICE_LINK_EXPIRED',
        message: 'This office link has expired',
      });
    }

    // Constant-time HMAC verification over slug + expiry.
    if (!this.codeService.verifyOfficeLink(slug, expNum, sig)) {
      throw new ForbiddenException({
        code: 'INVALID_OFFICE_LINK',
        message: 'Invalid or tampered office link',
      });
    }

    return await this.officeModel.findOne({ slug });
  }
}
