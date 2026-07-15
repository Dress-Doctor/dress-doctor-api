import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsInt, IsMongoId, IsOptional, Min } from 'class-validator';

export class RedeemDto {
  @ApiProperty({
    required: false,
    description:
      'Customer user id — staff only; customers always redeem their own points',
  })
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @ApiProperty({ required: true, example: 500, description: 'Points to spend' })
  @IsDefined()
  @IsInt()
  @Min(1)
  points: number;

  @ApiProperty({
    required: true,
    description: 'DRAFT order the discount applies to',
  })
  @IsDefined()
  @IsMongoId()
  orderId: string;
}
