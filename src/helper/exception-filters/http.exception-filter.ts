import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import constant from '../constant';
import {
  ErrorDetail,
  ErrorEnvelope,
  ErrorObject,
  HttpErrorPayload,
} from '../types/error.type';

/**
 * Default machine `code` per HTTP status when a thrown exception doesn't supply
 * its own. Explicit codes on the exception payload always win over this map.
 */
const STATUS_CODE_MAP: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'RATE_LIMITED',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'INTERNAL_SERVER_ERROR',
};

@Catch()
export class HTTPExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HTTPExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    response.setHeader('X-App-Name', 'Dress Doctor');
    response.removeHeader('X-Powered-By');

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let code: string | undefined = STATUS_CODE_MAP[status];
    let message = isHttp ? exception.message : constant.SERVER_ERROR;
    let details: ErrorDetail[] | undefined;

    if (isHttp) {
      const res = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res !== null) {
        const payload = res as HttpErrorPayload;
        if (typeof payload.code === 'string') {
          code = payload.code; // explicit domain code wins
        } else if (!code && typeof payload.error === 'string') {
          code = normalizeCode(payload.error);
        }
        if (Array.isArray(payload.details)) {
          details = payload.details;
        }
        if (typeof payload.message === 'string') {
          message = payload.message;
        } else if (
          Array.isArray(payload.message) &&
          payload.message.length > 0
        ) {
          message = String(payload.message[0]);
        }
      }
    }

    // Never leak internals on a 500 — mask message, drop code specifics + details.
    if (status === (HttpStatus.INTERNAL_SERVER_ERROR as number)) {
      this.logger.error(
        exception instanceof Error ? exception.message : constant.SERVER_ERROR,
        exception instanceof Error ? exception.stack : undefined,
      );
      code = 'INTERNAL_SERVER_ERROR';
      message = constant.SERVER_ERROR;
      details = undefined;
    }

    const error: ErrorObject = { code: code ?? 'ERROR' };
    if (details && details.length > 0) {
      error.details = details;
    }

    const errorEnvelope: ErrorEnvelope = {
      success: false,
      statusCode: status,
      error,
      message,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(errorEnvelope);
  }
}

/** "Bad Request" -> "BAD_REQUEST", "notFound" -> "NOT_FOUND". */
function normalizeCode(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s-]+/g, '_')
    .replace(/[^A-Za-z0-9_]/g, '')
    .toUpperCase();
}
