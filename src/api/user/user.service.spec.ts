import { REQUEST } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { AppUtilService } from 'src/helper/service/app-util.service';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { Customer } from 'src/schema/user/customer.schema';
import { UserType } from 'src/schema/user/user-type.schema';
import { User } from 'src/schema/user/user.schema';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: AppUtilService, useValue: {} },
        { provide: CodeGeneratorService, useValue: {} },
        { provide: REQUEST, useValue: { data: {}, user: {} } },
        { provide: getModelToken(User.name), useValue: {} },
        { provide: getModelToken(UserType.name), useValue: {} },
        { provide: getModelToken(Customer.name), useValue: {} },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
