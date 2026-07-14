import { AbilityBuilder } from '@casl/ability';
import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { AppAbility } from 'src/helper/casl/casl.dto';
import { FollowUp } from 'src/schema/follow-up/follow-up.schema';
import { FollowUpService } from './follow-up.service';

const manageAllAbility = () => {
  const { can, build } = new AbilityBuilder(AppAbility);
  can('manage', 'all');
  return build();
};

describe('FollowUpService', () => {
  let service: FollowUpService;
  let followUpModel: {
    findById: jest.Mock;
    find: jest.Mock;
    countDocuments: jest.Mock;
  };
  const userId = new Types.ObjectId();

  beforeEach(async () => {
    followUpModel = {
      findById: jest.fn(),
      find: jest.fn(),
      countDocuments: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FollowUpService,
        AppUtilService,
        { provide: getModelToken(FollowUp.name), useValue: followUpModel },
        {
          provide: REQUEST,
          useValue: {
            headers: {},
            data: { platform: 'WEB' },
            user: {
              phone: '600',
              userId: userId.toString(),
              ability: manageAllAbility(),
            },
          },
        },
      ],
    }).compile();

    service = await module.resolve(FollowUpService);
  });

  it('resolve sets resolvedAt/resolvedBy and saves the note', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    const followUp: Record<string, unknown> = {
      _id: new Types.ObjectId(),
      resolvedAt: undefined,
      save,
    };
    followUpModel.findById.mockResolvedValue(followUp);

    const result = await service.resolve(new Types.ObjectId().toString(), {
      note: 'Called the customer',
    });

    expect(result).toBe('Follow-up resolved');
    expect(followUp.resolvedAt).toBeInstanceOf(Date);
    expect(followUp.resolvedBy).toEqual(userId);
    expect(followUp.resolutionNote).toBe('Called the customer');
    expect(save).toHaveBeenCalled();
  });

  it('resolving twice is an idempotent no-op', async () => {
    const save = jest.fn();
    followUpModel.findById.mockResolvedValue({
      _id: new Types.ObjectId(),
      resolvedAt: new Date(),
      save,
    });

    const result = await service.resolve(new Types.ObjectId().toString(), {});

    expect(result).toBe('Follow-up already resolved');
    expect(save).not.toHaveBeenCalled();
  });

  it('404s on an unknown follow-up id', async () => {
    followUpModel.findById.mockResolvedValue(null);

    await expect(
      service.resolve(new Types.ObjectId().toString(), {}),
    ).rejects.toMatchObject({ response: { code: 'NOT_FOUND' } });
  });
});
