import { Test, TestingModule } from '@nestjs/testing';
import { PickupController } from './pickup.controller';
import { PickupService } from './pickup.service';

describe('PickupController', () => {
  let controller: PickupController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PickupController],
      providers: [PickupService],
    }).compile();

    controller = module.get<PickupController>(PickupController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
