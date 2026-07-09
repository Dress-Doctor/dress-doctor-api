import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ApiClient } from 'src/schema/admin/api-client.schema';
import constant from '../constant';
import { CodeGeneratorService } from './code-generator.service';

interface CacheEntry {
  apiClient: ApiClient;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

/**
 * Single place that verifies an x-api-key/x-api-secret pair against the
 * database. Shared by ApiClientGuard and LogRequestMiddleware so a request
 * only pays for one Mongo lookup + one bcrypt compare, not two.
 */
@Injectable()
export class ApiClientLookupService {
  private readonly logger = new Logger(ApiClientLookupService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    @InjectModel(ApiClient.name)
    private readonly apiClientModel: Model<ApiClient>,
    private readonly codeService: CodeGeneratorService,
  ) {}

  async verify(
    apiKey: string | undefined,
    apiSecret: string | undefined,
  ): Promise<ApiClient> {
    if (!apiKey || !apiSecret) {
      this.logger.error('API credentials are required');
      throw new UnauthorizedException('Invalid API credentials');
    }

    const cacheKey = `${apiKey}:${apiSecret}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.apiClient;

    const apiClient = await this.apiClientModel.findOne({ key: apiKey });
    if (!apiClient) {
      this.logger.error("API key doesn't exist");
      throw new UnauthorizedException('Invalid API credentials');
    }

    if (!apiClient.isActive) {
      this.logger.error('API key has been deactivated');
      throw new UnauthorizedException(constant.SERVER_ERROR);
    }

    const isValidSecret = await this.codeService.verifyHash(
      apiSecret,
      apiClient.secretHash,
    );
    if (!isValidSecret) {
      this.logger.error('Wrong api-secret');
      throw new UnauthorizedException('Invalid API credentials');
    }

    this.cache.set(cacheKey, {
      apiClient,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return apiClient;
  }
}
