import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { ApiClient } from 'src/schema/admin/api-client.schema';
import { CreateApiClientDto } from './dto/create-api-client.dto';

@Injectable()
export class ApiClientService {
  private readonly logger = new Logger(ApiClientService.name);

  constructor(
    private readonly codeService: CodeGeneratorService,
    @InjectModel(ApiClient.name)
    private readonly apiClientModel: Model<ApiClient>,
  ) {}

  async create(data: CreateApiClientDto) {
    const foundedApiClient = await this.apiClientModel.findOne({
      name: data.name,
    });
    if (foundedApiClient) {
      this.logger.error(
        `An api client already exists with this name ${data.name}`,
      );
      throw new ConflictException(
        `An api client with this name already exists`,
      );
    }

    const apiCredentials = await this.codeService.generateApiKey();
    await this.apiClientModel.create({ ...apiCredentials, ...data });
    this.logger.log('Api client created successfully');

    return {
      name: data.name,
      scope: data.scope,
      key: apiCredentials.key,
      describe: data.description,
      secret: apiCredentials.secret,
      expiresAt: apiCredentials.expiresAt,
    };
  }
}
