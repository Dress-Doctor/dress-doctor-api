import { ApiProperty } from '@nestjs/swagger';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
} from 'src/dto/swagger.dto';

export class OrderStatusEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({
    example: 'OS-A4F92C',
    description:
      'Human-readable identifier. Every read and write of a single order ' +
      'status is addressed by this, never by the mongo id.',
  })
  reference: string;

  @ApiProperty({ example: 'PENDING' })
  orderStatusName: string;

  @ApiProperty({ example: 'Order is pending activation', required: false })
  description?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllOrderStatusEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({ type: [OrderStatusEntity] })
  data: OrderStatusEntity[];
}

export class OrderStatusStatusCountEntity {
  @ApiProperty({ example: 7, description: 'Active plus inactive' })
  all: number;

  @ApiProperty({ example: 7, description: 'Statuses with isActive true' })
  active: number;

  @ApiProperty({ example: 0, description: 'Statuses with isActive false' })
  inactive: number;
}

export class OrderStatusKpiDataEntity {
  @ApiProperty({
    example: 7,
    description:
      'Order statuses matching every filter, `isActive` included. Equal to ' +
      '`byStatus.all` when no status filter was given.',
  })
  total: number;

  @ApiProperty({ example: 7, description: 'Same figure as byStatus.active' })
  totalActive: number;

  @ApiProperty({ example: 0, description: 'Same figure as byStatus.inactive' })
  totalInactive: number;

  @ApiProperty({
    type: OrderStatusStatusCountEntity,
    description:
      'Counts by `isActive` over the same filters MINUS `isActive`, so the ' +
      'status tab strip keeps every count whichever tab is selected.',
  })
  byStatus: OrderStatusStatusCountEntity;
}

export class OrderStatusKpiEntity extends ApiSuccessResponse {
  @ApiProperty({ type: OrderStatusKpiDataEntity })
  data: OrderStatusKpiDataEntity;
}

export class OrderStatusDetailDataEntity extends OrderStatusEntity {
  @ApiProperty({
    example: 42,
    description: 'How many orders currently sit at this status.',
  })
  orderCount: number;

  @ApiProperty({
    description:
      'Audit trail, newest first. Same shape as the pickup-status trail. ' +
      'The stored snapshot is never returned.',
  })
  history: Record<string, unknown>[];
}

export class OrderStatusDetailEntity extends ApiSuccessResponse {
  @ApiProperty({ type: OrderStatusDetailDataEntity })
  data: OrderStatusDetailDataEntity;
}
