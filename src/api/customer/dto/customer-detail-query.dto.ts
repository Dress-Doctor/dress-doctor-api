import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** How many months of ordered-vs-paid the spend trend covers. */
export class SpendTrendQueryDto {
  @ApiProperty({
    default: 12,
    example: 12,
    required: false,
    description: 'Months of history to chart, ending with the current month',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'months must be a number' })
  @Min(1, { message: 'months must be at least 1' })
  @Max(36, { message: 'months cannot be greater than 36' })
  months: number = 12;
}

/** How much of the merged activity feed to return. */
export class TimelineQueryDto {
  @ApiProperty({
    default: 20,
    example: 20,
    required: false,
    description: 'Maximum number of events to return, newest first',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit must be a number' })
  @Min(1, { message: 'limit must be at least 1' })
  @Max(100, { message: 'limit cannot be greater than 100' })
  limit: number = 20;
}
