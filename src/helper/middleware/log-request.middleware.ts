import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { NextFunction, Request } from 'express';
import { Model } from 'mongoose';
import { ApiClient } from 'src/schema/admin/api-client.schema';

@Injectable()
export class LogRequestMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Dress Doctor');

  constructor(
    @InjectModel(ApiClient.name)
    private readonly apiClientModel: Model<ApiClient>,
  ) {}

  private async getPlatformName(
    apiKey: string | undefined,
    apiSecret: string | undefined,
  ) {
    if (!apiKey || !apiSecret) return 'UNKNOWN';

    const apiClient = await this.apiClientModel.findOne({ key: apiKey });
    if (!apiClient) return 'UNKNOWN';

    return apiClient.name;
  }

  async use(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    const apiSecret = req.headers['x-api-secret'] as string | undefined;

    const platform = await this.getPlatformName(apiKey, apiSecret);
    this.logger.log(`${req.method} ${req.originalUrl} [${platform}]`);
    next();
  }
}
