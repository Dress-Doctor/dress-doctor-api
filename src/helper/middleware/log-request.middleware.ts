import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request } from 'express';
import { ApiClientLookupService } from '../service/api-client-lookup.service';

@Injectable()
export class LogRequestMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Dress Doctor');

  constructor(
    private readonly apiClientLookupService: ApiClientLookupService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    const apiSecret = req.headers['x-api-secret'] as string | undefined;

    let platform = 'UNKNOWN';
    if (apiKey && apiSecret) {
      try {
        const apiClient = await this.apiClientLookupService.verify(
          apiKey,
          apiSecret,
        );
        platform = apiClient.name;
      } catch {
        // invalid credentials are rejected downstream by ApiClientGuard;
        // logging still proceeds so the attempt is visible.
      }
    }

    this.logger.log(
      `${req.method} ${req.originalUrl} [${platform}] [${req.id}]`,
    );
    next();
  }
}
