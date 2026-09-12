import { ApiProperty } from '@nestjs/swagger';
import { ApiSuccessResponse } from 'src/dto/swagger.dto';

export class CustomerHistoryChangeEntity {
  @ApiProperty({ example: 'pickupAddress', description: 'Field that changed' })
  field: string;

  @ApiProperty({ description: 'Raw previous value', required: false })
  from?: unknown;

  @ApiProperty({ description: 'Raw new value', required: false })
  to?: unknown;

  @ApiProperty({
    required: false,
    example: 'DD 105 Bonadale',
    description:
      'Human-readable previous value when the field is a foreign key, ' +
      'resolved off the schema ref. Absent for plain values.',
  })
  fromLabel?: string;

  @ApiProperty({
    required: false,
    example: 'DD 210 Bonaberi',
    description: 'Human-readable new value when the field is a foreign key',
  })
  toLabel?: string;
}

export class CustomerHistoryEntryEntity {
  @ApiProperty({ example: 'UPDATE', description: 'CREATE | UPDATE | DELETE' })
  action: string;

  @ApiProperty({
    required: false,
    example: 'customer called to correct the phone number',
    description: 'The `x-change-reason` recorded against the change',
  })
  reason?: string;

  @ApiProperty({
    example: 'customer',
    description:
      'Which record the entry came from: `customer` (the profile) or ' +
      '`user` (the identity — name, phone, email, language).',
  })
  source: 'customer' | 'user';

  @ApiProperty({ type: [CustomerHistoryChangeEntity] })
  changes: CustomerHistoryChangeEntity[];

  @ApiProperty({ description: 'Who made the change (safe user fields only)' })
  changedByUser: Record<string, unknown> | null;

  @ApiProperty({ example: '2026-08-19T16:12:44.000Z' })
  createdAt: Date;
}

export class CustomerDetailDataEntity {
  @ApiProperty({ example: 'CU-A4F92C' })
  customerCode: string;

  @ApiProperty({ example: 'CLARISSE26' })
  referralCode: string;

  @ApiProperty({ description: 'Identity (safe user fields only)' })
  user: Record<string, unknown>;

  @ApiProperty({
    required: false,
    description: 'Reporting office, without its signed link',
  })
  homeOffice?: Record<string, unknown>;

  @ApiProperty({ required: false, example: 'Rue Bonadale 12, Douala' })
  pickupAddress?: string;

  @ApiProperty({ example: true })
  notificationsOptIn: boolean;

  @ApiProperty({ example: 24, description: 'System-maintained rollup' })
  totalOrders: number;

  @ApiProperty({ example: 385000, description: 'Integer XAF rollup' })
  totalSpend: number;

  @ApiProperty({ example: 1250 })
  rewardPoints: number;

  @ApiProperty({ required: false, description: 'The cached loyalty tier row' })
  rewardTier?: Record<string, unknown>;

  @ApiProperty({ required: false })
  lastOrderAt?: Date;

  @ApiProperty({ example: '2025-01-12T00:00:00.000Z' })
  registeredAt: Date;

  @ApiProperty({
    required: false,
    description:
      'The referral this customer was brought in by, with the referrer ' +
      'resolved. Absent for an organic customer.',
  })
  referredBy?: Record<string, unknown>;
}

export class CustomerDetailResponseEntity extends ApiSuccessResponse {
  @ApiProperty({ type: CustomerDetailDataEntity })
  data: CustomerDetailDataEntity;
}
