import { ConflictException, NotFoundException } from '@nestjs/common';
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
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let userModel: {
    findById: jest.Mock;
    exists: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };
  let roleModel: { findById: jest.Mock };
  let officeModel: { findById: jest.Mock };
  let userRoleModel: { findOneAndUpdate: jest.Mock; deleteOne: jest.Mock };
  let officeUserModel: { findOneAndUpdate: jest.Mock; deleteMany: jest.Mock };

  const id = new Types.ObjectId().toString();

  beforeEach(async () => {
    userModel = {
      findById: jest.fn(),
      exists: jest.fn().mockResolvedValue(null),
      findOneAndUpdate: jest.fn().mockResolvedValue({ _id: id }),
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
        { provide: AppUtilService, useValue: {} },
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
        { provide: getModelToken(UserType.name), useValue: {} },
        { provide: getModelToken(Customer.name), useValue: {} },
        { provide: getModelToken(Role.name), useValue: roleModel },
        { provide: getModelToken(UserRole.name), useValue: userRoleModel },
        { provide: getModelToken(Office.name), useValue: officeModel },
        { provide: getModelToken(OfficeUser.name), useValue: officeUserModel },
      ],
    }).compile();

    service = await module.resolve<UserService>(UserService);
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
