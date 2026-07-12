import { BadRequestException, ConflictException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Role } from 'src/schema/admin/role.schema';
import { OfficeType } from 'src/schema/office/office-type.schema';
import { OfficeUser } from 'src/schema/office/office-user.schema';
import { Office } from 'src/schema/office/office.schema';
import { User } from 'src/schema/user/user.schema';
import { CreateOfficeDto } from './dto/create-office.dto';
import { OfficeService } from './office.service';

type DocFactory = (data: Record<string, unknown>) => Record<string, unknown>;
const modelMock = (factory?: DocFactory) => {
  const ctor = jest
    .fn()
    .mockImplementation(factory ?? (() => ({}))) as jest.Mock & {
    exists: jest.Mock;
    findById: jest.Mock;
    findOneAndUpdate: jest.Mock;
    deleteMany: jest.Mock;
  };
  ctor.exists = jest.fn();
  ctor.findById = jest.fn();
  ctor.findOneAndUpdate = jest.fn();
  ctor.deleteMany = jest.fn();
  return ctor;
};

describe('OfficeService', () => {
  let service: OfficeService;
  let officeModel: ReturnType<typeof modelMock>;
  let officeTypeModel: ReturnType<typeof modelMock>;
  let officeUserModel: ReturnType<typeof modelMock>;
  let roleModel: ReturnType<typeof modelMock>;
  let userModel: ReturnType<typeof modelMock>;
  let codeService: {
    signOfficeLink: jest.Mock;
    generateOfficeCode: jest.Mock;
  };

  const id = new Types.ObjectId().toString();
  const doc = (data: Record<string, unknown>) => ({
    ...data,
    _id: new Types.ObjectId(),
    $locals: {} as Record<string, unknown>,
    save: jest.fn().mockResolvedValue(undefined),
  });

  const payload: CreateOfficeDto = {
    officeTypeId: id,
    officeName: 'Bonapriso Branch',
    slug: 'bonapriso',
    address: 'Rue 1',
    city: 'Douala',
    region: 'Littoral',
  };

  beforeEach(async () => {
    officeModel = modelMock(doc);
    officeTypeModel = modelMock();
    officeUserModel = modelMock();
    roleModel = modelMock();
    userModel = modelMock();

    officeTypeModel.findById.mockResolvedValue({ _id: id });
    officeModel.exists.mockResolvedValue(null);
    officeUserModel.findOneAndUpdate.mockResolvedValue(undefined);
    officeUserModel.deleteMany.mockResolvedValue(undefined);
    roleModel.exists.mockResolvedValue({ _id: id });
    userModel.exists.mockResolvedValue({ _id: id });

    codeService = {
      signOfficeLink: jest.fn().mockReturnValue('sig123'),
      generateOfficeCode: jest.fn().mockResolvedValue('OF-XYZ'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OfficeService,
        {
          provide: AppUtilService,
          useValue: {
            escapeRegex: (s: string) => s,
            parseSortParam: () => ({}),
          },
        },
        { provide: CodeGeneratorService, useValue: codeService },
        {
          provide: REQUEST,
          useValue: {
            data: { platform: 'WEB' },
            user: { phone: '600', userId: id, ability: { can: () => true } },
          },
        },
        { provide: getModelToken(Office.name), useValue: officeModel },
        { provide: getModelToken(OfficeType.name), useValue: officeTypeModel },
        { provide: getModelToken(OfficeUser.name), useValue: officeUserModel },
        { provide: getModelToken(Role.name), useValue: roleModel },
        { provide: getModelToken(User.name), useValue: userModel },
      ],
    }).compile();

    service = await module.resolve<OfficeService>(OfficeService);
  });

  describe('create', () => {
    it('generates officeCode + signedLink and saves', async () => {
      await service.create(payload);

      expect(officeModel).toHaveBeenCalledTimes(1);
      const calls = officeModel.mock.calls as unknown as Array<
        [{ officeCode: string; signedLink: string }]
      >;
      expect(calls[0][0].officeCode).toBe('OF-XYZ');
      expect(calls[0][0].signedLink).toContain('sig123');
    });

    it('rejects an invalid office type', async () => {
      officeTypeModel.findById.mockResolvedValue(null);
      await expect(service.create(payload)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects a duplicate name/slug', async () => {
      officeModel.exists.mockResolvedValue({ _id: id });
      await expect(service.create(payload)).rejects.toThrow(ConflictException);
    });
  });

  describe('assignUser', () => {
    it('upserts an OfficeUser row', async () => {
      officeModel.findById.mockResolvedValue({ _id: id });

      await service.assignUser(id, { userId: id, roleId: id });

      expect(officeUserModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('rejects an invalid role', async () => {
      officeModel.findById.mockResolvedValue({ _id: id });
      roleModel.exists.mockResolvedValue(null);

      await expect(
        service.assignUser(id, { userId: id, roleId: id }),
      ).rejects.toThrow('Invalid role id');
    });
  });

  describe('revokeUser', () => {
    it('deletes matching OfficeUser rows', async () => {
      await service.revokeUser(id, id);
      expect(officeUserModel.deleteMany).toHaveBeenCalledTimes(1);
    });
  });
});
