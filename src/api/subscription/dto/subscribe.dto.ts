import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsDefined, IsMongoId, IsOptional } from 'class-validator';

export class SubscribeDto {
  @ApiProperty({
    required: false,
    description:
      'Customer user id — staff only; customers always subscribe themselves',
  })
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @ApiProperty({ required: true, description: 'Subscription plan id' })
  @IsDefined()
  @IsMongoId()
  planId: string;

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  autoRenew?: boolean;
}
