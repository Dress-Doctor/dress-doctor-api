import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsString,
  MaxLength,
  MinLength,
  IsNumberString,
  IsOptional,
} from 'class-validator';

export class LoginDto {
  @ApiProperty({
    required: true,
    example: '698765294',
    description: 'User phone number',
  })
  @IsDefined({ message: 'Phone is required' })
  @IsNumberString({ no_symbols: true })
  @MaxLength(9, { message: 'Phone must be 9 digit long' })
  @MinLength(9, { message: 'Phone must be 9 digit long' })
  phone: string;

  @ApiProperty({
    required: false,
    example: 'password',
    description: 'User password',
  })
  @IsOptional()
  @IsString({ message: 'Password must be a string' })
  password: string;
}
