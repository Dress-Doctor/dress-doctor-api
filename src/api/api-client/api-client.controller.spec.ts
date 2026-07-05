import { Test, TestingModule } from '@nestjs/testing';
import { ApiClientController } from './api-client.controller';
import { ApiClientService } from './api-client.service';

describe('ApiClientController', () => {
  let controller: ApiClientController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApiClientController],
      providers: [ApiClientService],
    }).compile();

    controller = module.get<ApiClientController>(ApiClientController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
