import { Test, TestingModule } from '@nestjs/testing';
import { CheckAccessGuard } from 'src/helper/guard/check-access.guard';
import { OrderController } from './order.controller';
import { OrderService } from './order.service';

describe('OrderController', () => {
  let controller: OrderController;
  let service: Partial<Record<keyof OrderService, jest.Mock>>;

  beforeEach(async () => {
    service = {
      createOrder: jest.fn().mockResolvedValue('created'),
      createOrderWithPickup: jest.fn().mockResolvedValue('created'),
      findAll: jest
        .fn()
        .mockResolvedValue({ total: 0, data: [], nextPage: null }),
      findByCode: jest.fn().mockResolvedValue({ orderCode: 'OR-000123' }),
      confirmOrder: jest.fn().mockResolvedValue('confirmed'),
      receiveOrder: jest.fn().mockResolvedValue('received'),
      washOrder: jest.fn().mockResolvedValue('washing'),
      readyOrder: jest.fn().mockResolvedValue('ready'),
      deliverOrder: jest.fn().mockResolvedValue('delivered'),
      cancelOrder: jest.fn().mockResolvedValue('cancelled'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        {
          provide: OrderService,
          useValue: service,
        },
      ],
    })
      .overrideGuard(CheckAccessGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrderController>(OrderController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('getOrders should call service with query', async () => {
    const req: any = { data: { platform: 'p' }, user: { phone: '123' } };
    await controller.getOrders({ page: 1, size: 10 } as any, req);
    expect(service.findAll).toHaveBeenCalledWith({
      page: 1,
      size: 10,
    });
  });

  it('getOrderByCode should call service with the order code', async () => {
    const req: any = { data: { platform: 'p' }, user: { phone: '123' } };
    const res = await controller.getOrderByCode(
      { orderCode: 'OR-000123' } as any,
      req,
    );
    expect(service.findByCode).toHaveBeenCalledWith('OR-000123');
    expect(res).toEqual({ orderCode: 'OR-000123' });
  });

  it('createOrder should call service', async () => {
    const req: any = { data: { platform: 'p' }, user: { phone: '123' } };
    const body: any = {
      customerId: 'a',
      currencyId: 'b',
      pickupRequestId: 'c',
    };
    await controller.createOrderWithPickup(body, req);
    expect(service.createOrderWithPickup).toHaveBeenCalledWith(body);
  });

  it('confirmOrder should call service', async () => {
    const req: any = { data: { platform: 'p' }, user: { phone: '123' } };
    await controller.confirmOrder(req, { orderId: 'o' } as any);
    expect(service.confirmOrder).toHaveBeenCalledWith('o');
  });

  it('receiveOrder should call service', async () => {
    const req: any = { data: { platform: 'p' }, user: { phone: '123' } };
    await controller.receiveOrder(req, { orderId: 'o' } as any);
    expect(service.receiveOrder).toHaveBeenCalledWith('o');
  });

  it('washOrder should call service', async () => {
    const req: any = { data: { platform: 'p' }, user: { phone: '123' } };
    await controller.washOrder(req, { orderId: 'o' } as any);
    expect(service.washOrder).toHaveBeenCalledWith('o');
  });

  it('readyOrder should call service', async () => {
    const req: any = { data: { platform: 'p' }, user: { phone: '123' } };
    await controller.readyOrder(req, { orderId: 'o' } as any);
    expect(service.readyOrder).toHaveBeenCalledWith('o');
  });

  it('deliverOrder should call service', async () => {
    const req: any = { data: { platform: 'p' }, user: { phone: '123' } };
    await controller.deliverOrder(req, { orderId: 'o' } as any);
    expect(service.deliverOrder).toHaveBeenCalledWith('o');
  });

  it('cancelOrder should call service', async () => {
    const req: any = { data: { platform: 'p' }, user: { phone: '123' } };
    await controller.cancelOrder(req, { orderId: 'o' } as any);
    expect(service.cancelOrder).toHaveBeenCalledWith('o');
  });
});
