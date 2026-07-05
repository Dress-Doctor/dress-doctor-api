import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsDefined,
  IsEnum,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PlatformEnum } from 'src/schema/admin/admin.dto';

export class CreateApiClientDto {
  @ApiProperty({
    required: true,
    example: 'Dress Doctor Web App',
    description: 'Name of the service',
  })
  @IsDefined({ message: 'Name is required' })
  @IsString({ message: 'Name must be a string' })
  @MinLength(3, { message: 'Name must be at least 3 characters long' })
  @MaxLength(50, { message: 'Name must be less than 50 characters' })
  name: string;

  @ApiProperty({
    required: true,
    example: 'Laundry service in Douala',
    description: 'Short description of the service',
  })
  @IsDefined({ message: 'Description is required' })
  @IsString({ message: 'Description must be a string' })
  @MinLength(3, { message: 'Description must be at least 3 characters long' })
  @MaxLength(500, { message: 'Description must be less than 50 characters' })
  description: string;

  // @ApiProperty({
  //   required: false,
  //   example: '695fcf6f8cdbe03fdce69594',
  //   description: 'Who is creating this api-client',
  // })
  // @IsOptional()
  // @IsMongoId({ message: 'The provided Id is invalid for createdBy field' })
  // createdBy?: string;

  @ApiProperty({
    required: true,
    example: ['WEB'],
    description: 'Scope of API-Client',
  })
  @IsDefined({ message: 'Pickup time is required' })
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(PlatformEnum, {
    each: true,
    message: 'Scope must be one of these (WEB, MOBILE, MICRO_SERVICE)',
  })
  scope: PlatformEnum[];
}
