import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Order } from 'src/schema/order/order.schema';
import { OrderStatus } from 'src/schema/order/order-status.schema';
import { PickupAssignment } from 'src/schema/pickup/pickup-assignment.schema';
import { PickupRequest } from 'src/schema/pickup/pickup-request.schema';
import { PickupStatus } from 'src/schema/pickup/pickup-status.schema';
import { Customer } from 'src/schema/user/customer.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { PickupService } from './pickup.service';

describe('PickupService', () => {
  let service: PickupService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PickupService,
        { provide: AppUtilService, useValue: {} },
        { provide: CodeGeneratorService, useValue: {} },
        { provide: REQUEST, useValue: { data: {}, user: {} } },
        { provide: getModelToken(PickupStatus.name), useValue: {} },
        { provide: getModelToken(PickupRequest.name), useValue: {} },
        { provide: getModelToken(PickupAssignment.name), useValue: {} },
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
});
