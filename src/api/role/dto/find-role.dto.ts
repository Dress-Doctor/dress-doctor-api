import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaginationDto } from 'src/dto/request-data.dto';

/**
 * The filters behind `GET /v1/roles`, its KPIs and its tab strip. One DTO for
 * all three, so the three can never disagree about what they are looking at.
 */
export class FindRoleDto extends PaginationDto {
  @ApiProperty({
    required: false,
    example: 'Cashier',
    description:
      'Free-text search across reference, roleName and description. A role ' +
      'is looked for by what it is called as often as by what it does.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  q?: string;

  @ApiProperty({
    required: false,
    description: 'Narrows to active or inactive rows. Omit for both.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined ? undefined : value === 'true' || value === true,
  )
  @IsBoolean()
  isActive?: boolean;
}
