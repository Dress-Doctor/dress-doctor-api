import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectModel } from '@nestjs/mongoose';
import * as acceptLanguageParser from 'accept-language-parser';
import { Request } from 'express';
import { Model, Types } from 'mongoose';
import appConfig from 'src/config/app-config';
import { RequestDataDto } from 'src/dto/request-data.dto';
import { ApiClient } from 'src/schema/admin/api-client.schema';
import { OfficeType } from 'src/schema/office/office-type.schema';
import { OfficeTypeEnum } from 'src/schema/office/office.dto';
import { Office } from 'src/schema/office/office.schema';
import constant from '../constant';
import { SKIP_API_KEY } from '../decorator/skip-api-key.decorator';
import { CodeGeneratorService } from '../service/code-generator.service';

@Injectable()
export class ApiClientGuard implements CanActivate {
  private readonly logger = new Logger(ApiClientGuard.name);

  constructor(
    private reflector: Reflector,
    @InjectModel(ApiClient.name)
    private readonly apiClientModel: Model<ApiClient>,
    @InjectModel(OfficeType.name)
    private readonly officeTypeModel: Model<OfficeType>,
    private readonly codeService: CodeGeneratorService,
    @InjectModel(Office.name) private readonly officeModel: Model<Office>,
  ) {}

  private async getPlatformName(
    apiKey: string | undefined,
    apiSecret: string | undefined,
  ) {
    if (!apiKey || !apiSecret) {
      this.logger.error(`API credentials are required`);
      throw new UnauthorizedException('Invalid API credentials');
    }

    const apiClient = await this.apiClientModel.findOne({ key: apiKey });
    if (!apiClient) {
      this.logger.error(`API key doesn't exists`);
      throw new UnauthorizedException('Invalid API credentials');
    }

    if (apiClient && !apiClient.isActive) {
      this.logger.error(`API key has been deactivated`);
      throw new UnauthorizedException(constant.SERVER_ERROR);
    }

    const isValidSecret = await this.codeService.verifyHash(
      apiSecret,
      apiClient.secretHash,
    );
    if (!isValidSecret) {
      this.logger.error(`Wrong api-secret`);
      throw new UnauthorizedException('Invalid API credentials');
    }

    return { platform: apiClient.name, apiClientId: apiClient._id };
  }

  private async getOfficeId(cookie: string | undefined) {
    let officeId = cookie
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

    return new Types.ObjectId(officeId);
  }

  private getLanguage(acceptLanguage: string | undefined) {
    let language = acceptLanguage;
    if (!language) language = appConfig.defaultLanguage;

    const preferredLanguage = acceptLanguageParser.pick(
      appConfig.supportedLanguage,
      language,
    );

    return preferredLanguage ?? language;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const skipApiKeyCheck = this.reflector.getAllAndOverride<boolean>(
      SKIP_API_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipApiKeyCheck) return true;

    const apiKey = request.headers['x-api-key'] as string | undefined;
    const apiSecret = request.headers['x-api-secret'] as string | undefined;

    const apiClient = await this.getPlatformName(apiKey, apiSecret);
    const officeId = await this.getOfficeId(request.headers.cookie);
    const language = this.getLanguage(request.headers['accept-language']);

    request['data'] = { language, officeId, ...apiClient } as RequestDataDto;
    return true;
  }
}
