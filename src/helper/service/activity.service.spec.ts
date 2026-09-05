import { Types } from 'mongoose';
import { type AppRequest } from 'src/dto/request-data.dto';
import {
  ActivityKindEnum,
  ActivityOutcomeEnum,
} from 'src/schema/activity/activity.dto';
import { recordActivity, setActivityRecorder } from '../activity-recorder';
import { ActivityService } from './activity.service';

describe('ActivityService', () => {
  let service: ActivityService;
  let create: jest.Mock;

  /** The single row passed to `create([row], options)` on the nth call. */
  const rowOf = (call = 0): Record<string, unknown> => {
    const args = create.mock.calls[call] as [Record<string, unknown>[]];
    return args[0][0];
  };

  const userId = new Types.ObjectId();
  const officeId = new Types.ObjectId();

  const request = {
    id: 'req-1',
    ip: '10.0.0.4',
    headers: { 'user-agent': 'Mozilla/5.0' },
    data: {
      officeId,
      platform: 'dress-doctor-admin',
      reason: 'customer called to change the date',
    },
  } as unknown as AppRequest;

  beforeEach(() => {
    create = jest.fn().mockResolvedValue([{}]);
    service = new ActivityService({ create } as never);
  });

  afterEach(() => setActivityRecorder(undefined));

  it('writes the row it is given', async () => {
    await service.record({
      userId,
      action: 'order.create',
      kind: ActivityKindEnum.WRITE,
      resource: 'Order',
      resourceRef: 'OR-4B2C',
    });

    expect(create).toHaveBeenCalledWith(
      [expect.objectContaining({ action: 'order.create', userId })],
      { session: undefined },
    );
  });

  // An audit row is an observer of the write, never a participant in whether
  // it succeeds: a full disk must not fail the customer's order.
  it('swallows a write failure instead of failing the action', async () => {
    create.mockRejectedValue(new Error('mongo down'));

    await expect(
      service.record({
        userId,
        action: 'order.create',
        kind: ActivityKindEnum.WRITE,
        resource: 'Order',
      }),
    ).resolves.toBeUndefined();
  });

  it('joins the caller transaction when one is passed', async () => {
    const session = { id: 'txn' } as never;

    await service.record({
      userId,
      session,
      action: 'payment.create',
      kind: ActivityKindEnum.WRITE,
      resource: 'Payment',
    });

    expect(create).toHaveBeenCalledWith([expect.any(Object)], { session });
    // The session is metadata about how to write, not a field on the row.
    expect(rowOf()).not.toHaveProperty('session');
  });

  it('fills office, platform, request id and client off the request', async () => {
    await service.recordFromRequest(request, {
      userId,
      action: 'order.export',
      kind: ActivityKindEnum.EXPORT,
      resource: 'Order',
    });

    expect(create).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          officeId,
          ip: '10.0.0.4',
          requestId: 'req-1',
          userAgent: 'Mozilla/5.0',
          platform: 'dress-doctor-admin',
          reason: 'customer called to change the date',
        }),
      ],
      { session: undefined },
    );
  });

  // Losing these hides the very pattern the trail exists to surface.
  it('records a failed login that has no user behind it', async () => {
    await service.recordAuth(request, {
      action: 'auth.login',
      outcome: ActivityOutcomeEnum.FAILURE,
      metadata: { reason: 'UNKNOWN_IDENTIFIER' },
    });

    const row = rowOf();
    expect(row.outcome).toBe(ActivityOutcomeEnum.FAILURE);
    expect(row.kind).toBe(ActivityKindEnum.AUTH);
    expect(String(row.userId)).toBe('0'.repeat(24));
  });

  it('registers itself as the recorder the audit hook calls', async () => {
    service.onModuleInit();

    await recordActivity({
      userId,
      action: 'order.update',
      kind: ActivityKindEnum.WRITE,
      resource: 'Order',
    });

    expect(create).toHaveBeenCalledTimes(1);
  });

  // Unit tests build schemas with no app around them; a write must not blow up
  // because nothing is listening.
  it('is a no-op when no recorder is registered', async () => {
    await expect(
      recordActivity({
        userId,
        action: 'order.update',
        kind: ActivityKindEnum.WRITE,
        resource: 'Order',
      }),
    ).resolves.toBeUndefined();
  });
});
