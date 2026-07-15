import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDefined,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  BillingCycleEnum,
  OveragePolicyEnum,
  QuotaTypeEnum,
} from 'src/schema/subscription/subscription.dto';

class AllowanceDto {
  @ApiProperty({ example: 'bedsheets' })
  @IsDefined()
  @IsString()
  category: string;

  @ApiProperty({ example: 'pieces' })
  @IsDefined()
  @IsString()
  unit: string;

  @ApiProperty({ example: 4 })
  @IsDefined()
  @IsInt()
  @Min(0)
  amount: number;
}

export class UpsertPlanDto {
  @ApiProperty({ required: true, example: 'Basic' })
  @IsDefined()
  @IsString()
  planName: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: true, example: 20000, description: 'Fee, int XAF' })
  @IsDefined()
  @IsInt()
  @Min(0)
  price: number;

  @ApiProperty({ required: true, enum: BillingCycleEnum })
  @IsDefined()
  @IsEnum(BillingCycleEnum)
  billingCycle: BillingCycleEnum;

  @ApiProperty({ required: true, enum: QuotaTypeEnum })
  @IsDefined()
  @IsEnum(QuotaTypeEnum)
  quotaType: QuotaTypeEnum;

  @ApiProperty({ required: true, example: 40 })
  @IsDefined()
  @IsInt()
  @Min(1)
  quotaAmount: number;

  @ApiProperty({ required: false, enum: OveragePolicyEnum })
  @IsOptional()
  @IsEnum(OveragePolicyEnum)
  overagePolicy?: OveragePolicyEnum;

  @ApiProperty({ required: false, type: [AllowanceDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AllowanceDto)
  includedAllowances?: AllowanceDto[];

  @ApiProperty({ required: false, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  rolloverPeriods?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  pickupsPerPeriod?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  turnaroundHours?: number;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  applicableServiceTypeIds?: string[];

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
