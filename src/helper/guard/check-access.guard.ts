import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import { plainToClass } from 'class-transformer';
import {
  IsDefined,
  IsMongoId,
  validate,
  ValidationError,
} from 'class-validator';
import { Model, Types } from 'mongoose';
import { AppRequestWithUser } from 'src/dto/request-data.dto';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import constant from '../constant';
import { SourceDto } from '../decorator/check-access.decorator';
import { User } from 'src/schema/user/user.schema';

class ParamDTO {
  @IsDefined()
  @IsMongoId()
  id: string;
}
type CheckTypeDto = 'customer-pickup';

@Injectable()
export class CheckAccessGuard implements CanActivate {
  private readonly logger = new Logger(CheckAccessGuard.name);

  constructor(
    private reflector: Reflector,
    @InjectModel(PickupRequest.name)
    private readonly pickupRequestModel: Model<PickupRequest>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  private findFirstValidationError(
    errors: ValidationError[],
  ): ValidationError | null {
    if (!errors || errors.length === 0) return null;

    let current = errors[0];

    while (current) {
      if (current.constraints && Object.keys(current.constraints).length > 0) {
        return current;
      }

      if (current.children && current.children.length > 0) {
        current = current.children[0];
      } else {
        break;
      }
    }

    return null;
  }

  private async validateId(id: string, paramKey: string) {
    const paramDTO = plainToClass(ParamDTO, { id });
    const errors = await validate(paramDTO);

    if (errors.length > 0) {
      const error = this.findFirstValidationError(errors);
      if (!error?.constraints) {
        this.logger.error(constant.SERVER_ERROR);
        throw new BadRequestException(constant.SERVER_ERROR);
      }

      const message = Object.values(error.constraints)[0].replace(
        'id',
        `${paramKey}`,
      );
      this.logger.error(message, JSON.stringify(error));
      throw new BadRequestException(message);
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AppRequestWithUser>();

    const source = this.reflector.get<SourceDto>(
      'source',
      context.getHandler(),
    );
    const checkType = this.reflector.get<CheckTypeDto>(
      'checkType',
      context.getHandler(),
    );

    const paramKey = this.reflector.get<string>(
      'paramKey',
      context.getHandler(),
    );

    if (!paramKey) return false;

    let id = request.params?.[paramKey];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (source === 'body') id = request.body?.[paramKey] as string;
    if (typeof id !== 'string' || !id) return false;

    await this.validateId(id, paramKey);

    const { platform } = request.data;
    const phone = request.user.phone;
    const base = `[${platform}] ${phone}`;

    switch (checkType) {
      case 'customer-pickup': {
        const customerId = new Types.ObjectId(id);
        const customer = await this.userModel.findById(customerId);
        if (!customer) {
          this.logger.error(`${base} invalid customer id ${id}`);
          throw new BadRequestException('Invalid customer id');
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const pickupId = request.body['pickupRequestId'] as string;
        const pickupRequestId = new Types.ObjectId(pickupId);
        const pickupRequestExist = await this.pickupRequestModel.exists({
          _id: pickupRequestId,
        });

        if (!pickupRequestExist) {
          this.logger.error(`${base} invalid pickup request id ${pickupId}`);
          throw new BadRequestException('Invalid pickup request id');
        }

        const pickupRequest = await this.pickupRequestModel.findOne({
          _id: pickupRequestId,
          customerId,
        });
        if (!pickupRequest) {
          const log = `${base} this customer ${customer.phone} didn't schedule this pickup`;
          this.logger.error(log);
          throw new ForbiddenException(
            "The provided customer didn't schedule the provided pickup",
          );
        }

        break;
      }

      default:
        this.logger.error(`Invalid check type ${checkType as string}`);
        throw new ForbiddenException('Unknown check type');
    }

    return true;
  }
}
