import { ApiProperty } from '@nestjs/swagger';
import {
  ApiSuccessResponse,
  ApiSuccessResponseWithPagination,
} from 'src/dto/swagger.dto';

export class PaymentTypeEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h' })
  _id: string;

  @ApiProperty({
    example: 'PT-A4F92C',
    description:
      'Human-readable identifier. Every read and write of a single payment type ' +
      'is addressed by this, never by the mongo id.',
  })
  reference: string;

  @ApiProperty({ example: 'PAYMENT' })
  paymentTypeName: string;

  @ApiProperty({ example: 'What it is for', required: false })
  description?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  createdAt: string;

  @ApiProperty({ example: '2023-07-21T12:00:00Z' })
  updatedAt: string;
}

export class FindAllPaymentTypeEntity extends ApiSuccessResponseWithPagination {
  @ApiProperty({ type: [PaymentTypeEntity] })
  data: PaymentTypeEntity[];
}

export class PaymentTypeStatusCountEntity {
  @ApiProperty({ example: 2, description: 'Active plus inactive' })
  all: number;

  @ApiProperty({ example: 2, description: 'Rows with isActive true' })
  active: number;

  @ApiProperty({ example: 0, description: 'Rows with isActive false' })
  inactive: number;
}

export class PaymentTypeKpiDataEntity {
  @ApiProperty({
    example: 2,
    description:
      'Payment types matching every filter, `isActive` included. Equal to ' +
      '`byStatus.all` when no status filter was given.',
  })
  total: number;

  @ApiProperty({ example: 2, description: 'Same figure as byStatus.active' })
  totalActive: number;

  @ApiProperty({ example: 0, description: 'Same figure as byStatus.inactive' })
  totalInactive: number;

  @ApiProperty({
    type: PaymentTypeStatusCountEntity,
    description:
      'Counts by `isActive` over the same filters MINUS `isActive`, so the ' +
      'status tab strip keeps every count whichever tab is selected.',
  })
  byStatus: PaymentTypeStatusCountEntity;
}

export class PaymentTypeKpiEntity extends ApiSuccessResponse {
  @ApiProperty({ type: PaymentTypeKpiDataEntity })
  data: PaymentTypeKpiDataEntity;
}

export class PaymentTypeDetailDataEntity extends PaymentTypeEntity {
  @ApiProperty({
    example: 42,
    description: 'How many payments are filed under this type.',
  })
  paymentCount: number;

  @ApiProperty({
    description:
      'Audit trail, newest first. Same shape as the other reference trails. ' +
      'The stored snapshot is never returned.',
  })
  history: Record<string, unknown>[];
}

export class PaymentTypeDetailEntity extends ApiSuccessResponse {
  @ApiProperty({ type: PaymentTypeDetailDataEntity })
  data: PaymentTypeDetailDataEntity;
}
