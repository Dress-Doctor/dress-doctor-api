import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { type Request } from 'express';
import { Types } from 'mongoose';
import { UserRequestDto } from 'src/api/auth/dto/jwt.dto';

export class RequestDataDto {
  language: 'en' | 'fr';
  platform: string;
  officeId: Types.ObjectId;
  apiClientId: Types.ObjectId;
}

export type AppRequest = Request & { data: RequestDataDto };
export type AppRequestWithUser = AppRequest & { user: UserRequestDto };

export class PaginationDto {
  @ApiProperty({
    example: 1,
    required: true,
    description: 'Specifies the page number of the results to retrieve',
  })
  @IsDefined({ message: 'page is required' })
  @Type(() => Number)
  @IsInt({ message: 'page must be a number' })
  @Min(1, { message: 'page must be at least 1' })
  page: number;

  @ApiProperty({
    required: true,
    example: 10,
    description: 'Defines the number of items per page',
  })
  @IsDefined({ message: 'size is required' })
  @Type(() => Number)
  @IsInt({ message: 'size must be a number' })
  @Min(1, { message: 'size must be at least 1' })
  @Max(20, { message: 'size cannot be greater than 20' })
  size: number;

  @ApiProperty({
    required: false,
    example: 'createdAt:asc,id:desc',
    description:
      'Specifies the criteria and direction for ordering the results',
  })
  @IsOptional()
  @IsString()
  sort: string;
}
