import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  HttpStatus,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { HTTPExceptionFilter } from './http.exception-filter';
import { ErrorEnvelope } from '../types/error.type';
import constant from '../constant';

function buildHost(): {
  host: ArgumentsHost;
  getBody: () => ErrorEnvelope;
  getStatus: () => number;
} {
  let body = {} as ErrorEnvelope;
  let statusCode = 0;
  const response = {
    setHeader: () => response,
    removeHeader: () => response,
    status: (code: number) => {
      statusCode = code;
      return response;
    },
    json: (payload: ErrorEnvelope) => {
      body = payload;
      return response;
    },
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response }),
  } as unknown as ArgumentsHost;
  return { host, getBody: () => body, getStatus: () => statusCode };
}

describe('HTTPExceptionFilter (nested error envelope)', () => {
  const filter = new HTTPExceptionFilter();
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Silence (and observe) the server-side error log the filter writes on 500s,
    // so passing tests don't spew stack traces.
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('emits the nested envelope shape for a plain BadRequestException', () => {
    const { host, getBody, getStatus } = buildHost();

    filter.catch(new BadRequestException('Invalid customer id'), host);

    const body = getBody();
    expect(getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect(body.success).toBe(false);
    expect(body.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.details).toBeUndefined();
    expect(body.message).toBe('Invalid customer id');
    expect(typeof body.timestamp).toBe('string');
  });

  it('derives blueprint codes from status (401 -> UNAUTHENTICATED, 403 -> FORBIDDEN, 404 -> NOT_FOUND)', () => {
    const cases: Array<[Error, string, number]> = [
      [new UnauthorizedException(), 'UNAUTHENTICATED', HttpStatus.UNAUTHORIZED],
      [new ForbiddenException(), 'FORBIDDEN', HttpStatus.FORBIDDEN],
      [new NotFoundException(), 'NOT_FOUND', HttpStatus.NOT_FOUND],
    ];
    for (const [exception, code, status] of cases) {
      const { host, getBody } = buildHost();
      filter.catch(exception, host);
      expect(getBody().error.code).toBe(code);
      expect(getBody().statusCode).toBe(status);
    }
  });

  it('surfaces an explicit domain code + validation details from the payload', () => {
    const { host, getBody } = buildHost();

    filter.catch(
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: [{ field: 'amount', message: 'must be a positive integer' }],
      }),
      host,
    );

    const body = getBody();
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.details).toEqual([
      { field: 'amount', message: 'must be a positive integer' },
    ]);
    expect(body.message).toBe('Validation failed');
  });

  it('masks internals on a 500 (generic message, no details)', () => {
    const { host, getBody, getStatus } = buildHost();

    filter.catch(new Error('secret db connection string leaked'), host);

    const body = getBody();
    expect(getStatus()).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(body.error.details).toBeUndefined();
    expect(body.message).toBe(constant.SERVER_ERROR);
    expect(body.message).not.toContain('secret');
    // the real error is logged server-side (masked only in the response)
    expect(errorSpy).toHaveBeenCalled();
  });
});
