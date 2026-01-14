import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import type { AppRequestWithUser } from 'src/dto/request-data.dto';
import { UserType } from 'src/schema/user/user-type.schema';

@Injectable()
export class UtilService {
  private readonly logger = new Logger(UtilService.name);

  constructor(
    @Inject(REQUEST) private readonly req: AppRequestWithUser,
    @InjectModel(UserType.name) private readonly userTypeModel: Model<UserType>,
  ) {}

  async findAllUserType() {
    const platform = this.req.data.platform;
    const { phone, ability } = this.req.user;

    if (!ability.can('READ', 'UserType')) {
      const log = 'not authorized to perform this action';
      this.logger.error(`[${platform}] ${phone} ${log}`);
      throw new BadRequestException(`You are ${log}`);
    }

    const userTypes = await this.userTypeModel.find();
    return { data: userTypes };
  }
}
