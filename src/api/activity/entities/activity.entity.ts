import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';
import {
  ActivityKindEnum,
  ActivityOutcomeEnum,
} from 'src/schema/activity/activity.dto';

export class ActivityActorEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h7' })
  _id: string;

  @ApiProperty({ example: 'US-4B2C' })
  reference: string;

  @ApiProperty({ example: 'Ada' })
  firstName: string;

  @ApiProperty({ example: 'Mballa' })
  lastName: string;
}

export class ActivityEntity {
  @ApiProperty({ example: '64b8c9f1e4b0a2d3c4f5g6h7' })
  _id: string;

  @ApiProperty({ enum: ActivityKindEnum, example: ActivityKindEnum.WRITE })
  kind: ActivityKindEnum;

  @ApiProperty({ example: 'order.update' })
  action: string;

  @ApiProperty({ example: 'Order' })
  resource: string;

  @ApiProperty({ required: false, example: 'OR-4B2C' })
  resourceRef?: string;

  @ApiProperty({
    enum: ActivityOutcomeEnum,
    example: ActivityOutcomeEnum.SUCCESS,
  })
  outcome: ActivityOutcomeEnum;

  @ApiProperty({
    required: false,
    example: 'customer called to change the delivery date',
    description: 'The `x-change-reason` the actor gave for a write.',
  })
  reason?: string;

  @ApiProperty({
    required: false,
    example: { format: 'EXCEL', rows: 412 },
    description:
      'What makes this row legible — an export`s row count, or why a login ' +
      'failed. Never a copy of the record.',
  })
  metadata?: Record<string, unknown>;

  @ApiProperty({ required: false, example: 'dress-doctor-admin' })
  platform?: string;

  @ApiProperty({
    required: false,
    example: '7c3b1e42-9c4a-4a0f-9c1e-1f2a3b4c5d6e',
    description: 'Correlates the row with the request line in the logs.',
  })
  requestId?: string;

  @ApiProperty({ type: ActivityActorEntity })
  actor: ActivityActorEntity;

  @ApiProperty({ example: '2026-09-02T12:00:00Z' })
  createdAt: string;
}

export class FindAllActivityEntity extends ApiSuccessResponse {
  @ApiProperty({ type: [ActivityEntity] })
  data: ActivityEntity[];
}
