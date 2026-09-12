import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

/** What happened. The frontend words each kind; the API never ships prose. */
export enum CustomerTimelineKindEnum {
  ORDER_CREATED = 'ORDER_CREATED',
  ORDER_DELIVERED = 'ORDER_DELIVERED',
  PAYMENT_RECORDED = 'PAYMENT_RECORDED',
  PICKUP_REQUESTED = 'PICKUP_REQUESTED',
  PROFILE_CHANGED = 'PROFILE_CHANGED',
}

export class CustomerTimelineEventEntity {
  @ApiProperty({ enum: CustomerTimelineKindEnum })
  kind: CustomerTimelineKindEnum;

  @ApiProperty({ example: '2026-08-21T10:42:00.000Z' })
  at: Date;

  @ApiProperty({
    required: false,
    example: 'PY-1102',
    description: 'The code of whatever the event is about',
  })
  reference?: string;

  @ApiProperty({ required: false, example: 25000, description: 'Integer XAF' })
  amount?: number;

  @ApiProperty({
    required: false,
    example: 'MOMO',
    description: 'Payment method, order status or pickup status as applicable',
  })
  status?: string;

  @ApiProperty({
    required: false,
    example: 'OR-1024',
    description: 'The order a payment or pickup relates to, when there is one',
  })
  relatedReference?: string;

  @ApiProperty({
    required: false,
    description: 'Who caused it, for staff-made changes (safe user fields)',
  })
  actor?: Record<string, unknown>;

  @ApiProperty({
    required: false,
    isArray: true,
    description: 'For PROFILE_CHANGED — the field names that moved',
  })
  fields?: string[];
}

export class CustomerTimelineResponseEntity extends ApiSuccessResponse {
  @ApiProperty({ type: [CustomerTimelineEventEntity] })
  data: CustomerTimelineEventEntity[];
}
