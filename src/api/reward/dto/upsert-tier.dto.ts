import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { RewardTierMetricEnum } from 'src/schema/reward/reward.dto';

export class UpsertTierDto {
  @ApiProperty({ required: true, example: 'Silver' })
  @IsDefined()
  @IsString()
  tierName: string;

  @ApiProperty({
    required: true,
    enum: RewardTierMetricEnum,
    example: RewardTierMetricEnum.SPEND,
  })
  @IsDefined()
  @IsEnum(RewardTierMetricEnum)
  metric: RewardTierMetricEnum;

  @ApiProperty({
    required: true,
    example: 100000,
    description: 'Min lifetime spend (XAF) or order count to qualify',
  })
  @IsDefined()
  @IsInt()
  @Min(0)
  threshold: number;

  @ApiProperty({ required: false, type: Object })
  @IsOptional()
  @IsObject()
  perk?: Record<string, unknown>;

  @ApiProperty({ required: true, example: 1, description: 'Higher = better' })
  @IsDefined()
  @IsInt()
  @Min(0)
  rank: number;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
