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

  async validateOfficeLink(slug: string, sig: string) {
    const expectedSig = this.codeService.signOfficeLink(slug);
    if (sig !== expectedSig)
      throw new ForbiddenException('Invalid or tampered office link');

    return await this.officeModel.findOne({ slug });
  }
}
