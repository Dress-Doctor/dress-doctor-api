import { BadRequestException, ConflictException } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Customer } from 'src/schema/user/customer.schema';
import { Referral } from 'src/schema/user/referral.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { CustomerService } from './customer.service';
import { FindCustomerDto } from './dto/find-customer.dto';

// A constructor mock that also carries Mongoose statics (exists/findOne/...).
type DocFactory = (data: Record<string, unknown>) => Record<string, unknown>;
const modelMock = (factory: DocFactory) => {
  const ctor = jest.fn().mockImplementation(factory) as jest.Mock & {
    exists: jest.Mock;
    findOne: jest.Mock;
    findById: jest.Mock;
    aggregate: jest.Mock;
  };
  ctor.exists = jest.fn();
  ctor.findOne = jest.fn();
  ctor.findById = jest.fn();
  ctor.aggregate = jest.fn();
  return ctor;
};

describe('CustomerService', () => {
  let service: CustomerService;
  let userModel: ReturnType<typeof modelMock>;
  let customerModel: ReturnType<typeof modelMock>;
  let referralModel: ReturnType<typeof modelMock>;
  let userTypeModel: ReturnType<typeof modelMock>;
  let codeService: {
    generateCustomerCode: jest.Mock;
    generateReferralCode: jest.Mock;
  };

  const doc = (data: Record<string, unknown>) => ({
    ...data,
    _id: new Types.ObjectId(),
    $locals: {} as Record<string, unknown>,
    save: jest.fn().mockResolvedValue(undefined),
  });

  const validPayload = {
    firstName: 'Ada',
    lastName: 'Deo',
    phone: '698765294',
    whatsappPhone: '698765294',
  };

  beforeEach(async () => {
    userModel = modelMock(doc);
    customerModel = modelMock(doc);
    referralModel = modelMock(doc);
    userTypeModel = modelMock(doc);

    userModel.exists.mockResolvedValue(null);
    customerModel.findOne.mockResolvedValue(null);
    userTypeModel.findOne.mockResolvedValue({ _id: new Types.ObjectId() });

    codeService = {
      generateCustomerCode: jest.fn().mockResolvedValue('CU-ABC123'),
      generateReferralCode: jest.fn().mockResolvedValue('REF456'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerService,
        {
          provide: AppUtilService,
          useValue: { escapeRegex: (s: string) => s },
        },
        { provide: CodeGeneratorService, useValue: codeService },
        {
          provide: REQUEST,
          useValue: {
            data: { platform: 'WEB' },
            user: {
              phone: '600000000',
              userId: new Types.ObjectId().toString(),
              ability: { can: () => true },
            },
          },
        },
        { provide: getModelToken(User.name), useValue: userModel },
        { provide: getModelToken(UserType.name), useValue: userTypeModel },
        { provide: getModelToken(Customer.name), useValue: customerModel },
        { provide: getModelToken(Referral.name), useValue: referralModel },
      ],
    }).compile();

    service = await module.resolve<CustomerService>(CustomerService);
  });

  it('registers: creates a User + Customer and returns both codes', async () => {
    const res = await service.register(validPayload);

    expect(userModel).toHaveBeenCalledTimes(1);
    expect(customerModel).toHaveBeenCalledTimes(1);
    expect(referralModel).not.toHaveBeenCalled();
    expect(res).toEqual({ customerCode: 'CU-ABC123', referralCode: 'REF456' });
  });

  it('links referredBy and opens a PENDING referral when a code is given', async () => {
    const referrerUserId = new Types.ObjectId();
    customerModel.findOne.mockResolvedValue({ userId: referrerUserId });

    await service.register({ ...validPayload, referralCode: 'FRIEND' });

    expect(referralModel).toHaveBeenCalledTimes(1);
    expect(referralModel).toHaveBeenCalledWith(
      expect.objectContaining({ referrerId: referrerUserId }),
    );
    // Customer created with a referredBy pointer.
    const customerCalls = customerModel.mock.calls as unknown as Array<
      [{ referredBy?: Types.ObjectId }]
    >;
    expect(customerCalls[0][0].referredBy).toBeInstanceOf(Types.ObjectId);
  });

  it('rejects an unknown referral code', async () => {
    customerModel.findOne.mockResolvedValue(null);

    await expect(
      service.register({ ...validPayload, referralCode: 'NOPE' }),
    ).rejects.toThrow(BadRequestException);
    expect(userModel).not.toHaveBeenCalled();
  });

  it('rejects a duplicate phone', async () => {
    userModel.exists.mockResolvedValue({ _id: new Types.ObjectId() });

    await expect(service.register(validPayload)).rejects.toThrow(
      ConflictException,
    );
    expect(customerModel).not.toHaveBeenCalled();
  });

  it('findInactive defaults the threshold to 14 days', async () => {
    const spy = jest
      .spyOn(service, 'findAll')
      .mockResolvedValue({ total: 0, data: [], nextPage: null });

    await service.findInactive({ page: 1, size: 20 } as FindCustomerDto);

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ inactiveDays: 14 }),
    );
  });

  it('rejects a duplicate email', async () => {
    userModel.exists
      .mockResolvedValueOnce(null) // phone
      .mockResolvedValueOnce({ _id: new Types.ObjectId() }); // email

    await expect(
      service.register({ ...validPayload, email: 'taken@example.com' }),
    ).rejects.toThrow(ConflictException);
  });
});
