import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Role } from 'src/schema/admin/role.schema';
import { UserRole } from 'src/schema/admin/user-role.schema';
import { Office } from 'src/schema/office/office.schema';
import { OfficeUser } from 'src/schema/office/office-user.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { FindAllUserDto } from './dto/find-all-user.dto';
import { UserService } from './user.service';

type QueryChain = {
  populate: jest.Mock;
  sort: jest.Mock;
  skip: jest.Mock;
  limit: jest.Mock;
};

describe('UserService', () => {
  let service: UserService;
  let userModel: {
    find: jest.Mock;
    countDocuments: jest.Mock;
    findById: jest.Mock;
    exists: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let escapeRegex: jest.Mock;
  let userTypeModel: { findOne: jest.Mock };
  let roleModel: { findById: jest.Mock };
  let officeModel: { findById: jest.Mock };
  let userRoleModel: { findOneAndUpdate: jest.Mock; deleteOne: jest.Mock };
  let officeUserModel: { findOneAndUpdate: jest.Mock; deleteMany: jest.Mock };

  const id = new Types.ObjectId().toString();
  const userTypeId = new Types.ObjectId();

  beforeEach(async () => {
    // find() is chained: .populate().sort().skip().limit(), awaited at the end.
    const chain: QueryChain = {
      populate: jest.fn(() => chain),
      sort: jest.fn(() => chain),
      skip: jest.fn(() => chain),
      limit: jest.fn().mockResolvedValue([{ _id: id }]),
    };
    userModel = {
      find: jest.fn(() => chain),
      countDocuments: jest.fn().mockResolvedValue(1),
      findById: jest.fn(),
      exists: jest.fn().mockResolvedValue(null),
      findOneAndUpdate: jest.fn().mockResolvedValue({ _id: id }),
    };
    escapeRegex = jest.fn((value: string) =>
      value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
    userTypeModel = {
      findOne: jest.fn().mockResolvedValue({
        _id: userTypeId,
        userTypeName: 'CUSTOMER',
      }),
    };
    roleModel = { findById: jest.fn().mockResolvedValue({ _id: id }) };
    officeModel = { findById: jest.fn().mockResolvedValue({ _id: id }) };
    userRoleModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue(undefined),
      deleteOne: jest.fn().mockResolvedValue(undefined),
    };
    officeUserModel = {
      findOneAndUpdate: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: AppUtilService,
          useValue: { escapeRegex, parseSortParam: () => ({}) },
        },
        { provide: CodeGeneratorService, useValue: {} },
        {
          provide: REQUEST,
          useValue: {
            data: { platform: 'WEB' },
            user: {
              phone: '600000000',
              userId: id,
              ability: { can: () => true },
            },
          },
        },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(UserType.name), useValue: userTypeModel },
        { provide: getModelToken(Customer.name), useValue: {} },
        { provide: getModelToken(Role.name), useValue: roleModel },
        { provide: getModelToken(UserRole.name), useValue: userRoleModel },
        { provide: getModelToken(Office.name), useValue: officeModel },
        { provide: getModelToken(OfficeUser.name), useValue: officeUserModel },
      ],
    }).compile();

    service = await module.resolve<UserService>(UserService);
  });

  describe('findAll', () => {
    const query = (extra: Partial<FindAllUserDto> = {}) =>
      ({ page: 1, size: 10, ...extra }) as FindAllUserDto;

    const whereOf = (mock: jest.Mock) =>
      (mock.mock.calls as unknown as Array<[Record<string, unknown>]>)[0][0];

    it('does not filter when no q or userType is given', async () => {
      await service.findAll(query());

      expect(whereOf(userModel.find)).toEqual({});
      expect(escapeRegex).not.toHaveBeenCalled();
      expect(userTypeModel.findOne).not.toHaveBeenCalled();
    });

    it('searches first name, last name, email, phone and whatsapp phone', async () => {
      await service.findAll(query({ q: 'jane' }));

      const rx = new RegExp('jane', 'i');
      expect(whereOf(userModel.find).$or).toEqual([
        { firstName: rx },
        { lastName: rx },
        { email: rx },
        { phone: rx },
        { whatsappPhone: rx },
      ]);
    });

    it('escapes regex metacharacters in q', async () => {
      await service.findAll(query({ q: 'a+b(c)' }));

      expect(escapeRegex).toHaveBeenCalledWith('a+b(c)');
      const or = whereOf(userModel.find).$or as Array<{ firstName: RegExp }>;
      expect(or[0].firstName.source).toBe('a\\+b\\(c\\)');
      expect(or[0].firstName.flags).toBe('i');
    });

    it('resolves userType by name to its id', async () => {
      await service.findAll(query({ userType: 'CUSTOMER' }));

      expect(userTypeModel.findOne).toHaveBeenCalledWith({
        userTypeName: 'CUSTOMER',
      });
      expect(whereOf(userModel.find).userTypeId).toEqual(userTypeId);
    });

    it('normalises userType casing and whitespace', async () => {
      await service.findAll(query({ userType: '  customer ' }));

      expect(userTypeModel.findOne).toHaveBeenCalledWith({
        userTypeName: 'CUSTOMER',
      });
    });

    it('rejects an unknown userType', async () => {
      userTypeModel.findOne.mockResolvedValue(null);

      await expect(
        service.findAll(query({ userType: 'GHOST' })),
      ).rejects.toThrow(BadRequestException);
      expect(userModel.find).not.toHaveBeenCalled();
    });

    it('combines q with userType', async () => {
      await service.findAll(query({ q: 'jane', userType: 'CUSTOMER' }));

      const where = whereOf(userModel.find);
      expect(where.userTypeId).toEqual(userTypeId);
      expect(where.$or).toHaveLength(5);
    });

    it('counts with the same filter it queries with', async () => {
      await service.findAll(query({ q: 'jane' }));

      expect(whereOf(userModel.countDocuments)).toEqual(
        whereOf(userModel.find),
      );
    });

    it('returns the pagination envelope', async () => {
      userModel.countDocuments.mockResolvedValue(25);

      const result = await service.findAll(query({ page: 1, size: 10 }));

      expect(result).toEqual({
        total: 25,
        data: [{ _id: id }],
        nextPage: 2,
      });
    });
  });

  describe('update', () => {
    it('rejects a duplicate email', async () => {
      userModel.findById.mockResolvedValue({ _id: id });
      userModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

      await expect(
        service.update(id, { email: 'taken@example.com' }),
      ).rejects.toThrow(ConflictException);
    });

    it('404s on a missing user', async () => {
      userModel.findById.mockResolvedValue(null);
      await expect(service.update(id, { firstName: 'A' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('assignRole', () => {
    it('assigns a global role via UserRole when no office', async () => {
      userModel.findById.mockResolvedValue({ _id: id });

      await service.assignRole(id, { roleId: id });

      expect(userRoleModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(officeUserModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('assigns a per-office role via OfficeUser when officeId given', async () => {
      userModel.findById.mockResolvedValue({ _id: id });

      await service.assignRole(id, { roleId: id, officeId: id });

      expect(officeUserModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(userRoleModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects an invalid role', async () => {
      userModel.findById.mockResolvedValue({ _id: id });
      roleModel.findById.mockResolvedValue(null);

      await expect(service.assignRole(id, { roleId: id })).rejects.toThrow(
        'Invalid role id',
      );
    });
  });

  describe('revokeRole', () => {
    it('clears both UserRole and OfficeUser rows', async () => {
      await service.revokeRole(id, id);
      expect(userRoleModel.deleteOne).toHaveBeenCalledTimes(1);
      expect(officeUserModel.deleteMany).toHaveBeenCalledTimes(1);
    });
  });

  describe('deactivate', () => {
    it('soft-deactivates the user', async () => {
      userModel.findById.mockResolvedValue({ _id: id });

      await service.deactivate(id);

      expect(userModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const calls = userModel.findOneAndUpdate.mock.calls as unknown as Array<
        [unknown, { isActive: boolean }]
      >;
      expect(calls[0][1].isActive).toBe(false);
    });
  });
});
