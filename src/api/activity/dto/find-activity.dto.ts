import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsISO8601, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';
import { ActivityKindEnum } from 'src/schema/activity/activity.dto';

export class FindActivityDto extends PaginationDto {
  @ApiProperty({
    required: false,
    example: 'US-4B2C',
    description:
      'Whose activity to read, by the user reference. Omit to read every ' +
      'actor the caller is allowed to see.',
  })
  @IsOptional()
  @IsString()
  userReference?: string;

  @ApiProperty({
    required: false,
    enum: ActivityKindEnum,
    description: 'WRITE, AUTH or EXPORT.',
  })
  @IsOptional()
  @IsEnum(ActivityKindEnum)
  kind?: ActivityKindEnum;

  @ApiProperty({
    required: false,
    example: 'order.create',
    description: 'Exact action, `resource.verb`.',
  })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiProperty({
    required: false,
    example: 'Order',
    description: 'Only what the actor did to this kind of record.',
  })
  @IsOptional()
  @IsString()
  resource?: string;

  @ApiProperty({
    required: false,
    example: 'OR-4B2C',
    description: 'Everyone who touched one record, by its human reference.',
  })
  @IsOptional()
  @IsString()
  resourceRef?: string;

  @ApiProperty({ required: false, example: '2026-09-01' })
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @ApiProperty({ required: false, example: '2026-09-30' })
  @IsOptional()
  @IsISO8601()
  endDate?: string;
}
