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

@Catch()
export class HTTPExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HTTPExceptionFilter.name);
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    response.setHeader('X-App-Name', 'Dress Doctor');
    response.removeHeader('X-Powered-By');

    const status: HttpStatus =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const res = exception.getResponse() as { message: string; error: string };

    const errorResponse = {
      success: false,
      statusCode: status,
      errorCode: res.error,
      timestamp: new Date().toISOString(),
      error: exception?.message ?? constant.SERVER_ERROR,
    };

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        exception?.message ?? constant.SERVER_ERROR,
        exception.stack,
      );
      errorResponse.error = constant.SERVER_ERROR;
    }

    response.status(status).json(errorResponse);
  }
}
