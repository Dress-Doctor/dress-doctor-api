import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Response } from 'express';
import { Observable } from 'rxjs';
import { map, tap } from 'rxjs/operators';

class HTTPResponse {
  data?: unknown;
  total?: number;
  message?: string;
  nextPage?: number;
}

@Injectable()
export class HTTPResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const start = process.hrtime(); // high-resolution start time

    const httpContext = context.switchToHttp();
    const response = httpContext.getResponse<Response>();
    const statusCode = response.statusCode;

    return next.handle().pipe(
      tap(() => {
        const [sec, nanoSeconds] = process.hrtime(start);
        const durationInSec = (sec * 1e3 + nanoSeconds / 1e6) / 1000;
        response.setHeader('X-Response-Time', `${durationInSec.toFixed(3)}s`);
        response.setHeader('X-App-Name', 'Dress Doctor');
        response.removeHeader('X-Powered-By');
      }),

      map((data: HTTPResponse | string) => {
        const timestamp = new Date().toISOString();
        if (typeof data === 'string') {
          return { success: true, message: data, statusCode, timestamp };
        }

        let payload: { [key: string]: unknown } = {};
        if (data?.total !== undefined) {
          payload = { ...data };
        }

        let message = 'Successful';
        if (data.message) {
          message = data.message;
          delete data['message'];
        }

        return {
          success: true,
          statusCode,
          ...payload,
          data: data?.data ?? data ?? null,
          message,
          timestamp,
        };
      }),
    );
  }
}
