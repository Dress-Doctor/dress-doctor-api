import { AbilityBuilder } from '@casl/ability';
import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppAbility } from 'src/helper/casl/casl.dto';
import { PickupStatusEnum } from 'src/schema/pickup/pickup.dto';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { HistoryLabelService } from 'src/helper/service/history-label.service';
import { Office } from 'src/schema/office/office.schema';
import { Order } from 'src/schema/order/order.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { PickupAssignment } from 'src/schema/pickup/pickup-assignment.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { PickupService } from './pickup.service';
import { ActivityService } from 'src/helper/service/activity.service';

// A real (unrestricted) ability so scopeFilter's rulesToQuery works and yields
// an empty (unrestricted) filter in these tests.
const manageAllAbility = () => {
  const { can, build } = new AbilityBuilder(AppAbility);
  can('manage', 'all');
  return build();
};

// An office-scoped role, the shape the seeder gives Office Manager/Driver.
const officeScopedAbility = (
  officeId: Types.ObjectId,
  action: 'READ' | 'UPDATE' | 'CONFIRM' = 'READ',
) => {
  const { can, build } = new AbilityBuilder(AppAbility);
  can(action, 'PickupRequest', { officeId: officeId.toString() } as never);
  return build();
};

describe('PickupService', () => {
  let service: PickupService;
  let pickupRequestModel: { aggregate: jest.Mock; findOne: jest.Mock };
  let pickupStatusModel: { findOne: jest.Mock };
  let req: {
    data: { platform: string };
    user: { phone: string; ability: ReturnType<typeof manageAllAbility> };
  };

  beforeEach(async () => {
    pickupRequestModel = { aggregate: jest.fn(), findOne: jest.fn() };
    pickupStatusModel = { findOne: jest.fn() };
    req = {
      data: { platform: 'ADMIN' },
      user: { phone: '+237600000000', ability: manageAllAbility() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        // The trail observes these services; it never changes what they do.
        {
          provide: ActivityService,
          useValue: {
            record: jest.fn().mockResolvedValue(undefined),
            recordAuth: jest.fn().mockResolvedValue(undefined),
            recordFromRequest: jest.fn().mockResolvedValue(undefined),
          },
        },
        PickupService,
        { provide: AppUtilService, useValue: new AppUtilService() },
        { provide: CodeGeneratorService, useValue: {} },
        {
          provide: HistoryLabelService,
          useValue: { labelChanges: jest.fn() },
        },
        { provide: REQUEST, useValue: req },
        {
          provide: getModelToken(PickupStatus.name),
          useValue: pickupStatusModel,
        },
        {
          provide: getModelToken(PickupRequest.name),
          useValue: pickupRequestModel,
        },
        { provide: getModelToken(PickupAssignment.name), useValue: {} },
        { provide: getModelToken(Office.name), useValue: {} },
        { provide: getModelToken(Order.name), useValue: {} },
        { provide: getModelToken(OrderStatus.name), useValue: {} },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: getModelToken(UserType.name), useValue: {} },
        { provide: getModelToken(Customer.name), useValue: {} },
      ],
    }).compile();

    service = module.get<PickupService>(PickupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPickupKpis', () => {
    it('counts every status once when no status filter is set', async () => {
      pickupRequestModel.aggregate.mockResolvedValue([
        { _id: 'PENDING', count: 4 },
        { _id: 'CONFIRMED', count: 3 },
        { _id: 'ASSIGNED', count: 1 },
        { _id: 'PICKED_UP', count: 10 },
        { _id: 'CANCELLED', count: 2 },
        // A pickup whose status row is missing still counts towards `all`.
        { _id: null, count: 1 },
      ]);

      const kpis = await service.getPickupKpis({ page: 1, size: 20, sort: '' });

      // One pass only: with no status filter the two sets are identical.
      expect(pickupRequestModel.aggregate).toHaveBeenCalledTimes(1);
      expect(kpis.totalPickups).toBe(21);
      expect(kpis.pending).toBe(4);
      expect(kpis.completed).toBe(10);
      // Cancelled are out of the divisor: 10 / (21 - 2) = 52.6%.
      expect(kpis.completionBase).toBe(19);
      expect(kpis.completionRate).toBe(52.6);
      expect(kpis.byPickupStatus).toEqual({
        all: 21,
        pending: 4,
        confirmed: 3,
        assigned: 1,
        pickedUp: 10,
        cancelled: 2,
      });
    });

    it('narrows the cards to the status filter but not the breakdown', async () => {
      const statusId = new Types.ObjectId();
      pickupStatusModel.findOne.mockResolvedValue({ _id: statusId });
      pickupRequestModel.aggregate
        // Across every status: the tab counts.
        .mockResolvedValueOnce([
          { _id: 'PENDING', count: 4 },
          { _id: 'PICKED_UP', count: 10 },
        ])
        // Narrowed to PENDING: the cards.
        .mockResolvedValueOnce([{ _id: 'PENDING', count: 4 }]);

      const kpis = await service.getPickupKpis({
        page: 1,
        size: 20,
        sort: '',
        pickupStatusName: PickupStatusEnum.PENDING,
      });

      expect(pickupRequestModel.aggregate).toHaveBeenCalledTimes(2);
      // The breakdown still spans every status...
      expect(kpis.byPickupStatus.all).toBe(14);
      expect(kpis.byPickupStatus.pickedUp).toBe(10);
      // ...while the headline figures describe the filtered set alone.
      expect(kpis.totalPickups).toBe(4);
      expect(kpis.pending).toBe(4);
      expect(kpis.completed).toBe(0);
      expect(kpis.completionRate).toBe(0);

      const calls = pickupRequestModel.aggregate.mock.calls as [
        { $match: Record<string, unknown> }[],
      ][];
      // The status clause is applied on top of the base filter, not instead.
      expect(calls[1][0][0].$match).toMatchObject({
        pickupStatusId: statusId,
        createdAt: expect.anything() as unknown,
      });
      // The breakdown pass carries the same base filter minus that clause.
      expect(calls[0][0][0].$match).not.toHaveProperty('pickupStatusId');
    });

    it('scopes the counts to what the caller may read', async () => {
      const officeId = new Types.ObjectId();
      req.user.ability = officeScopedAbility(officeId);
      pickupRequestModel.aggregate.mockResolvedValue([]);

      await service.getPickupKpis({ page: 1, size: 20, sort: '' });

      const calls = pickupRequestModel.aggregate.mock.calls as [
        { $match: Record<string, unknown> }[],
      ][];
      // The CASL condition rides along as a query filter, so an office-scoped
      // caller can never count another office's pickups.
      expect(calls[0][0][0].$match.$and).toEqual([{ $or: [{ officeId }] }]);
    });

    it('reports a 0 rate when everything in the set was cancelled', async () => {
      pickupRequestModel.aggregate.mockResolvedValue([
        { _id: 'CANCELLED', count: 3 },
      ]);

      const kpis = await service.getPickupKpis({ page: 1, size: 20, sort: '' });

      expect(kpis.completionBase).toBe(0);
      expect(kpis.completionRate).toBe(0);
    });
  });

  describe('write-path scoping', () => {
    it('cannot confirm a pickup outside the caller scope', async () => {
      const officeId = new Types.ObjectId();
      const pickupId = new Types.ObjectId();
      req.user.ability = officeScopedAbility(officeId, 'CONFIRM');
      // Another office's pickup: the scoped lookup matches nothing.
      pickupRequestModel.findOne.mockResolvedValue(null);

      await expect(service.confirmPickup(pickupId.toString())).rejects.toThrow(
        'Pickup not found',
      );
      expect(pickupRequestModel.findOne).toHaveBeenCalledWith({
        _id: pickupId,
        $or: [{ officeId }],
      });
    });

    it('cannot cancel a pickup outside the caller scope', async () => {
      const officeId = new Types.ObjectId();
      const pickupId = new Types.ObjectId();
      req.user.ability = officeScopedAbility(officeId, 'UPDATE');
      pickupRequestModel.findOne.mockResolvedValue(null);

      await expect(service.cancelPickup(pickupId.toString())).rejects.toThrow(
        'Pickup not found',
      );
      expect(pickupRequestModel.findOne).toHaveBeenCalledWith({
        _id: pickupId,
        $or: [{ officeId }],
      });
    });

    it('looks a pickup up unscoped for an unrestricted caller', async () => {
      const pickupId = new Types.ObjectId();
      pickupRequestModel.findOne.mockResolvedValue(null);

      await expect(service.cancelPickup(pickupId.toString())).rejects.toThrow(
        'Pickup not found',
      );
      // manage-all carries no conditions, so nothing narrows the lookup.
      expect(pickupRequestModel.findOne).toHaveBeenCalledWith({
        _id: pickupId,
      });
    });
  });
});
