import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppRequest } from 'src/dto/request-data.dto';
import {
  CHANGE_REASON_HEADER,
  ChangeReasonGuard,
  MAX_REASON_LENGTH,
} from './change-reason.guard';

describe('ChangeReasonGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: ChangeReasonGuard;

  const contextFor = (
    request: Partial<AppRequest>,
    type: 'http' | 'ws' = 'http',
  ) =>
    ({
      getType: () => type,
      getHandler: () => undefined,
      getClass: () => undefined,
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const req = (over: Partial<AppRequest> = {}): Partial<AppRequest> => ({
    method: 'POST',
    url: '/v1/orders',
    headers: {},
    data: {} as AppRequest['data'],
    ...over,
  });

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
    guard = new ChangeReasonGuard(reflector as unknown as Reflector);
  });

  it('lets a read through untouched', () => {
    expect(guard.canActivate(contextFor(req({ method: 'GET' })))).toBe(true);
  });

  it.each(['POST', 'PATCH', 'PUT', 'DELETE'])(
    'rejects a %s with no reason',
    (method) => {
      expect(() => guard.canActivate(contextFor(req({ method })))).toThrow(
        BadRequestException,
      );
    },
  );

  it('names the header and a stable code when it rejects', () => {
    try {
      guard.canActivate(contextFor(req()));
      throw new Error('should have thrown');
    } catch (error) {
      const response = (error as BadRequestException).getResponse();
      expect(response).toMatchObject({
        code: 'CHANGE_REASON_REQUIRED',
        field: CHANGE_REASON_HEADER,
      });
    }
  });

  it('rejects a reason too short to mean anything', () => {
    expect(() =>
      guard.canActivate(
        contextFor(req({ headers: { [CHANGE_REASON_HEADER]: 'x' } })),
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a reason past the column length', () => {
    expect(() =>
      guard.canActivate(
        contextFor(
          req({
            headers: {
              [CHANGE_REASON_HEADER]: 'a'.repeat(MAX_REASON_LENGTH + 1),
            },
          }),
        ),
      ),
    ).toThrow(BadRequestException);
  });

  it('accepts a reason and hands it to the request context, trimmed', () => {
    const request = req({
      headers: { [CHANGE_REASON_HEADER]: '  washing had not started  ' },
    });

    expect(guard.canActivate(contextFor(request))).toBe(true);
    expect(request.data?.reason).toBe('washing had not started');
  });

  it('skips a route marked @SkipChangeReason', () => {
    reflector.getAllAndOverride.mockReturnValue(true);

    expect(guard.canActivate(contextFor(req()))).toBe(true);
  });

  it('ignores non-http contexts (queue jobs, cron)', () => {
    expect(guard.canActivate(contextFor(req(), 'ws'))).toBe(true);
  });
});
