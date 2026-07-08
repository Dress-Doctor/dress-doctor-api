import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { ApiClient } from 'src/schema/admin/api-client.schema';
import { CodeGeneratorService } from 'src/helper/service/code-generator.service';
import { ApiClientService } from './api-client.service';

describe('ApiClientService', () => {
  let service: ApiClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiClientService,
        { provide: CodeGeneratorService, useValue: {} },
        { provide: getModelToken(ApiClient.name), useValue: {} },
      ],
    }).compile();

    service = module.get<ApiClientService>(ApiClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
