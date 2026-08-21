import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class PickupHistoryChangeEntity {
  @ApiProperty({ example: 'pickupStatusId', description: 'Field that changed' })
  field: string;

  @ApiProperty({ description: 'Raw previous value', required: false })
  from?: unknown;

  @ApiProperty({ description: 'Raw new value', required: false })
  to?: unknown;

  @ApiProperty({
    required: false,
    example: 'PENDING',
    description:
      'Human-readable previous value when the field is a foreign key, ' +
      'resolved off the schema ref. Absent for plain values.',
  })
  fromLabel?: string;

  @ApiProperty({
    required: false,
    example: 'CONFIRMED',
    description: 'Human-readable new value when the field is a foreign key',
  })
  toLabel?: string;
}

export class PickupHistoryEntryEntity {
  @ApiProperty({ example: 'UPDATE', description: 'CREATE | UPDATE | DELETE' })
  action: string;

  @ApiProperty({
    required: false,
    example: 'customer called to confirm the address',
    description: 'The `x-change-reason` recorded against the change',
  })
  reason?: string;

  @ApiProperty({ type: [PickupHistoryChangeEntity] })
  changes: PickupHistoryChangeEntity[];

  @ApiProperty({ description: 'Who made the change (safe user fields only)' })
  changedByUser: Record<string, unknown>;

  @ApiProperty({ example: '2026-08-15T09:12:44.000Z' })
  createdAt: Date;
}

export class PickupOrderSummaryEntity {
  @ApiProperty({ example: 'OR-000123' })
  orderCode: string;

  @ApiProperty({ example: 'RECEIVED', nullable: true })
  status: string | null;

  @ApiProperty({ example: 'PARTIAL', required: false })
  paymentStatus?: string;

  @ApiProperty({ example: 15000, description: 'Integer XAF' })
  totalAmount: number;

  @ApiProperty({ example: 5000, description: 'Integer XAF' })
  amountPaid: number;

  @ApiProperty({ example: 10000, description: 'Integer XAF' })
  balanceDue: number;

  @ApiProperty({ required: false })
  receivedAt?: Date;

  @ApiProperty({ required: false })
  estimatedDeliveryDate?: Date;

  @ApiProperty({ required: false })
  deliveredAt?: Date;
}

export class PickupDetailDataEntity {
  @ApiProperty({ example: 'PU-A4F92C' })
  reference: string;

  @ApiProperty({ example: 'Bonapriso, Douala' })
  pickupAddress: string;

  @ApiProperty({ example: '2026-08-16T00:00:00.000Z' })
  pickupDate: Date;

  @ApiProperty({ example: 'MORNING 8AM - 12PM' })
  pickupTime: string;

  @ApiProperty({ description: 'Customer (safe user fields only)' })
  customer: Record<string, unknown>;

  @ApiProperty({ description: 'Office, without its signed link' })
  office: Record<string, unknown>;

  @ApiProperty({ description: 'The pickup status row' })
  pickupStatus: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'Who confirmed the pickup, when one has',
  })
  confirmedByUser?: Record<string, unknown>;

  @ApiProperty({
    isArray: true,
    description: 'Agent assignments, newest first, each with its agent',
  })
  assignments: Record<string, unknown>[];

  @ApiProperty({
    type: [PickupOrderSummaryEntity],
    description:
      'The orders raised off this pickup, newest first. Empty until one is ' +
      'created; the full order lives at GET /orders/:orderCode.',
  })
  orders: PickupOrderSummaryEntity[];

  @ApiProperty({
    type: [PickupHistoryEntryEntity],
    description:
      'Audit trail, newest first, capped at the latest 100 entries. Carries ' +
      'only what changed — never the stored snapshot.',
  })
  history: PickupHistoryEntryEntity[];
}

export class PickupDetailResponseEntity extends ApiSuccessResponse {
  @ApiProperty({ type: PickupDetailDataEntity })
  data: PickupDetailDataEntity;
}
