import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { RewardRuleTypeEnum } from 'src/schema/reward/reward.dto';

class RuleCriteriaDto {
  @ApiProperty({
    required: false,
    example: 100,
    description: 'ACCRUAL: 1 point per this many XAF paid',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  per?: number;

  @ApiProperty({
    required: true,
    example: 1,
    description: 'Points granted (per `per` XAF, or per milestone hit)',
  })
  @IsDefined()
  @IsInt()
  @Min(0)
  points: number;

  @ApiProperty({
    required: false,
    example: 5,
    description: 'MILESTONE: bonus on every Nth paid order',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  everyNthOrder?: number;
}

export class UpsertRuleDto {
  @ApiProperty({ required: true, enum: RewardRuleTypeEnum })
  @IsDefined()
  @IsEnum(RewardRuleTypeEnum)
  type: RewardRuleTypeEnum;

  @ApiProperty({ required: true, type: RuleCriteriaDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => RuleCriteriaDto)
  criteria: RuleCriteriaDto;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
