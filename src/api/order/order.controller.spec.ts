import { Test, TestingModule } from '@nestjs/testing';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

describe('OrderController', () => {
  let controller: OrderController;
  let service: Partial<Record<keyof OrderService, jest.Mock>>;

  beforeEach(async () => {
    service = {
      createOrder: jest.fn().mockResolvedValue('created'),
      findAllWithItems: jest
        .fn()
        .mockResolvedValue({ total: 0, data: [], nextPage: null }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        {
          provide: OrderService,
          useValue: service,
        },
      ],
    }).compile();

    controller = module.get<OrderController>(OrderController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getOrders should call service with query', async () => {
    const req: any = { data: { platform: 'p' }, user: { phone: '123' } };
    await controller.getOrders({ page: 1, size: 10 } as any, req);
    expect(service.findAllWithItems).toHaveBeenCalledWith({
      page: 1,
      size: 10,
    });
  });

  it('createOrder should call service', async () => {
    const req: any = { data: { platform: 'p' }, user: { phone: '123' } };
    const body: any = {
      customerId: 'a',
      currencyId: 'b',
      pickupRequestId: 'c',
    };
    await controller.createOrderWithPickup(body, req);
    expect(service.createOrder).toHaveBeenCalledWith(body);
  });
});
