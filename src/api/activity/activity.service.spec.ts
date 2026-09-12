import { AbilityBuilder } from '@casl/ability';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PipelineStage, Types } from 'mongoose';
import { type AppRequestWithUser } from 'src/dto/request-data.dto';
import { AppAbility } from 'src/helper/casl/casl.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { ActivityKindEnum } from 'src/schema/activity/activity.dto';
import { ActivityReadService } from './activity.service';
import { FindActivityDto } from './dto/find-activity.dto';

describe('ActivityReadService', () => {
  let service: ActivityReadService;
  let activityModel: {
    countDocuments: jest.Mock;
    aggregate: jest.Mock;
    distinct: jest.Mock;
  };
  let userModel: { findOne: jest.Mock };

  const officeId = new Types.ObjectId();
  const actorId = new Types.ObjectId();

  /** A real CASL ability: scopeFilter reads the rules, not just `can`. */
  const makeAbility = (conditions?: Record<string, unknown>) => {
    const { can, build } = new AbilityBuilder(AppAbility);
    can('READ', 'Activity', conditions as never);
    return build();
  };

  const makeRequest = (ability: ReturnType<typeof makeAbility>) =>
    ({
      data: { platform: 'dress-doctor-admin', officeId },
      user: { phone: '237690000000', userId: actorId.toString(), ability },
    }) as unknown as AppRequestWithUser;

  const query = (over: Partial<FindActivityDto> = {}): FindActivityDto =>
    ({ page: 1, size: 20, ...over }) as FindActivityDto;

  const lean = (value: unknown) => ({
    select: () => ({ lean: () => Promise.resolve(value) }),
  });

  const build = (ability = makeAbility()) => {
    service = new ActivityReadService(
      new AppUtilService(),
      makeRequest(ability),
      activityModel as never,
      userModel as never,
    );
    return service;
  };

  beforeEach(() => {
    activityModel = {
      countDocuments: jest.fn().mockResolvedValue(2),
      aggregate: jest.fn().mockResolvedValue([]),
      distinct: jest.fn().mockResolvedValue([]),
    };
    userModel = { findOne: jest.fn(() => lean({ _id: actorId })) };
    build();
  });

  /** The pipeline the service just handed to aggregate(). */
  const pipeline = (): PipelineStage[] => {
    const calls = activityModel.aggregate.mock.calls as [PipelineStage[]][];
    return calls[0][0];
  };

  /** The $match stage of that pipeline. */
  const matchOf = (): Record<string, unknown> => {
    const stage = pipeline().find(
      (entry): entry is PipelineStage.Match => '$match' in entry,
    );
    return stage?.$match ?? {};
  };

  it('refuses a caller without READ Activity', async () => {
    const { build: buildAbility } = new AbilityBuilder(AppAbility);
    build(buildAbility());

    await expect(service.findAll(query())).rejects.toThrow(ForbiddenException);
    expect(activityModel.aggregate).not.toHaveBeenCalled();
  });

  it('reads newest first by default', async () => {
    await service.findAll(query());

    const sortStage = pipeline().find((stage) => '$sort' in stage);
    expect(sortStage).toEqual({ $sort: { createdAt: -1 } });
  });

  it('resolves a user reference into the actor filter', async () => {
    await service.findAll(query({ userReference: 'US-4B2C' }));

    expect(userModel.findOne).toHaveBeenCalledWith({ reference: 'US-4B2C' });
    expect(matchOf()).toMatchObject({ userId: actorId });
  });

  // Dropping the clause would widen the query to every actor — the opposite of
  // what the caller asked for.
  it('matches nothing when the reference is unknown', async () => {
    userModel.findOne.mockReturnValue(lean(null));

    await service.findAll(query({ userReference: 'US-NOPE' }));

    expect(matchOf()).toMatchObject({ userId: { $in: [] } });
  });

  it('passes the kind, action and resource filters through', async () => {
    await service.findAll(
      query({
        kind: ActivityKindEnum.EXPORT,
        action: 'order.export',
        resource: 'Order',
        resourceRef: 'OR-4B2C',
      }),
    );

    expect(matchOf()).toMatchObject({
      kind: ActivityKindEnum.EXPORT,
      action: 'order.export',
      resource: 'Order',
      resourceRef: 'OR-4B2C',
    });
  });

  it('covers the whole of the end day, not just its midnight', async () => {
    await service.findAll(
      query({ startDate: '2026-09-01', endDate: '2026-09-30' }),
    );

    const range = matchOf().createdAt as { $gte: Date; $lte: Date };
    expect(range.$gte).toEqual(new Date('2026-09-01'));
    expect(range.$lte.toISOString()).toContain('2026-09-30T23:59:59');
  });

  it('rejects an unknown reference on the per-user read', async () => {
    userModel.findOne.mockReturnValue(lean(null));

    await expect(service.findForUser('US-NOPE', query())).rejects.toThrow(
      BadRequestException,
    );
  });

  // The office scope is the caller's own CASL condition, never something they
  // send — an office-scoped reviewer cannot ask for another branch's trail.
  it('confines an office-scoped caller to their own office', async () => {
    build(makeAbility({ officeId: officeId.toString() }));

    await service.findAll(query());

    expect(JSON.stringify(matchOf())).toContain(officeId.toString());
  });

  describe('resourcesForUser', () => {
    it('offers every resource in the trail, sorted, without the blanks', async () => {
      // A row written before `resource` was mandatory has none. Mongo hands
      // the empty back as its own value; nobody can filter on it.
      activityModel.distinct.mockResolvedValue(['Order', '', 'Customer']);

      const result = await service.resourcesForUser('US-4B2C');

      expect(activityModel.distinct).toHaveBeenCalledWith(
        'resource',
        expect.objectContaining({ userId: actorId }),
      );
      expect(result).toEqual({ resources: ['Customer', 'Order'] });
    });

    // The list is what the filter offers, so it must not narrow with the
    // filter: only the actor and the caller's own scope may bound it.
    it('bounds the list by the caller`s office scope', async () => {
      build(makeAbility({ officeId: officeId.toString() }));

      await service.resourcesForUser('US-4B2C');

      const calls = activityModel.distinct.mock.calls as [string, object][];
      expect(JSON.stringify(calls[0][1])).toContain(officeId.toString());
    });

    it('refuses a caller without READ Activity', async () => {
      const { build: buildAbility } = new AbilityBuilder(AppAbility);
      build(buildAbility());

      await expect(service.resourcesForUser('US-4B2C')).rejects.toThrow(
        ForbiddenException,
      );
      expect(activityModel.distinct).not.toHaveBeenCalled();
    });

    it('rejects an unknown reference', async () => {
      userModel.findOne.mockReturnValue(lean(null));

      await expect(service.resourcesForUser('US-NOPE')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  it('returns the pagination envelope', async () => {
    activityModel.countDocuments.mockResolvedValue(45);

    const result = await service.findAll(query({ page: 1, size: 20 }));

    expect(result).toEqual({ total: 45, data: [], nextPage: 2 });
  });
});
