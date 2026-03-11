import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsNumber, IsOptional, Min } from 'class-validator';

export class RefundPaymentDto {
  @ApiProperty({ required: true, description: 'Refund amount', example: 0 })
  @IsDefined({ message: 'Amount is required' })
  @Transform(({ value }) => Number(value))
  @IsNumber({}, { message: 'Amount must be a number' })
  @Min(0, { message: 'Amount cannot be negative' })
  amount: number;

  @ApiProperty({ required: false, description: 'Refund reason' })
  @IsOptional()
  reason?: string;

  @ApiProperty({ required: false, description: 'Refund note' })
  @IsOptional()
  note?: string;
}
