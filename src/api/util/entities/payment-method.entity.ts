import { ApiProperty } from '@nestjs/swagger';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
} from 'src/dto/swagger.dto';

export class PaymentMethodEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({
    example: 'PM-A4F92C',
    description:
      'Human-readable identifier. Every read and write of a single payment method ' +
      'is addressed by this, never by the mongo id.',
  })
  reference: string;

  @ApiProperty({ example: 'Cash' })
  paymentMethodName: string;

  @ApiProperty({ example: 'What it is for', required: false })
  description?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllPaymentMethodEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({ type: [PaymentMethodEntity] })
  data: PaymentMethodEntity[];
}

export class PaymentMethodStatusCountEntity {
  @ApiProperty({ example: 3, description: 'Active plus inactive' })
  all: number;

  @ApiProperty({ example: 3, description: 'Rows with isActive true' })
  active: number;

  @ApiProperty({ example: 0, description: 'Rows with isActive false' })
  inactive: number;
}

export class PaymentMethodKpiDataEntity {
  @ApiProperty({
    example: 3,
    description:
      'Payment methods matching every filter, `isActive` included. Equal to ' +
      '`byStatus.all` when no status filter was given.',
  })
  total: number;

  @ApiProperty({ example: 3, description: 'Same figure as byStatus.active' })
  totalActive: number;

  @ApiProperty({ example: 0, description: 'Same figure as byStatus.inactive' })
  totalInactive: number;

  @ApiProperty({
    type: PaymentMethodStatusCountEntity,
    description:
      'Counts by `isActive` over the same filters MINUS `isActive`, so the ' +
      'status tab strip keeps every count whichever tab is selected.',
  })
  byStatus: PaymentMethodStatusCountEntity;
}

export class PaymentMethodKpiEntity extends ApiSuccessResponse {
  @ApiProperty({ type: PaymentMethodKpiDataEntity })
  data: PaymentMethodKpiDataEntity;
}

export class PaymentMethodDetailDataEntity extends PaymentMethodEntity {
  @ApiProperty({
    example: 42,
    description: 'How many payments were taken by this method.',
  })
  paymentCount: number;

  @ApiProperty({
    description:
      'Audit trail, newest first. Same shape as the other reference trails. ' +
      'The stored snapshot is never returned.',
  })
  history: Record<string, unknown>[];
}

export class PaymentMethodDetailEntity extends ApiSuccessResponse {
  @ApiProperty({ type: PaymentMethodDetailDataEntity })
  data: PaymentMethodDetailDataEntity;
}
