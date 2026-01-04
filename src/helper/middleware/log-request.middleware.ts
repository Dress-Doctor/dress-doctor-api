import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request } from 'express';

@Injectable()
export class LogRequestMiddleware implements NestMiddleware {
  private readonly logger = new Logger('Dress Doctor');
  use(req: Request, res: Response, next: NextFunction) {
    this.logger.log(` ${req.method} ${req.originalUrl}`);
    next();
  }
}
