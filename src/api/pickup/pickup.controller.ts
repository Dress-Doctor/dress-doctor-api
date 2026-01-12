import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Ip,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiBody, ApiOperation } from '@nestjs/swagger';
import { type Request } from 'express';
import { Model } from 'mongoose';
import { OfficeType } from 'src/schema/office/office-type.schema';
import { OfficeTypeEnum } from 'src/schema/office/office.dto';
import { Office } from 'src/schema/office/office.schema';
import { CreatePickupDto, NewPickupDto } from './dto/create-pickup.dto';
import { PickupService } from './pickup.service';
import { Public } from 'src/helper/decorator/public.decorator';

@Controller('pickup')
export class PickupController {
  private readonly logger = new Logger(PickupController.name);
  constructor(
    private readonly pickupService: PickupService,
    @InjectModel(Office.name) private readonly officeModel: Model<Office>,
    @InjectModel(OfficeType.name)
    private readonly officeTypeModel: Model<OfficeType>,
  ) {}

  @Post()
  @Public()
  @HttpCode(HttpStatus.CREATED)
  @ApiBody({ type: CreatePickupDto })
  @ApiOperation({ summary: 'Used to schedule a pickup' })
  async create(
    @Req() req: Request,
    @Ip() ipAddress: string,
    @Body() data: CreatePickupDto,
  ) {
    const log = `${data.phone} is scheduling a pickup with ${JSON.stringify(data)}`;
    this.logger.log(log);

    let officeId = req.headers.cookie
      ?.split(';')
      .find((cooky) => cooky.includes('office_ref'))
      ?.split('=')
      .at(-1);

    if (!officeId) {
      const officeType = await this.officeTypeModel.findOne({
        officeTypeName: OfficeTypeEnum.FACTORY,
      });
      const foundedOffice = await this.officeModel.exists({
        officeTypeId: officeType!.id,
      });
      officeId = foundedOffice!._id.toString();
    }

    const newPickupData: NewPickupDto = { ...data, officeId };
    return await this.pickupService.create(newPickupData);
  }
}
