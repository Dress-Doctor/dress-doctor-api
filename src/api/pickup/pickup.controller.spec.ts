import { Test, TestingModule } from '@nestjs/testing';
import { PickupController } from './pickup.controller';
import { PickupService } from './pickup.service';

describe('PickupController', () => {
  let controller: PickupController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PickupController],
      providers: [
        {
          provide: PickupService,
          useValue: {
            schedulePickup: jest.fn(),
            findAllPickup: jest.fn(),
            assignPickup: jest.fn(),
            confirmPickup: jest.fn(),
            cancelPickup: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PickupController>(PickupController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
