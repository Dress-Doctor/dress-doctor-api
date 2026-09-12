import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

// A 9-digit phone or a basic email — the identifier used to log in. The OTP
// channel is inferred: phone → WhatsApp, email → email.
const PHONE_OR_EMAIL = /^(\d{9}|[^@\s]+@[^@\s]+\.[^@\s]+)$/;

export class InitiateLoginDto {
  @ApiProperty({
    required: true,
    example: '698765294',
    description: 'Phone (9 digits) or email — OTP channel is inferred from it',
  })
  @IsDefined({ message: 'identifier is required' })
  @IsString()
  @Matches(PHONE_OR_EMAIL, {
    message: 'identifier must be a 9-digit phone or a valid email',
  })
  identifier: string;

  @ApiProperty({
    required: false,
    example: 'password',
    description: 'User password (staff only)',
  })
  @IsOptional()
  @IsString({ message: 'Password must be a string' })
  password?: string;
}

export class CompleteLoginDto {
  @ApiProperty({
    required: true,
    example: '123456',
    description: 'OTP send to client',
  })
  @IsDefined({ message: 'Code is required' })
  @IsNumberString({ no_symbols: true })
  @MaxLength(6, { message: 'Code must be 6 digit long' })
  @MinLength(6, { message: 'Code must be 6 digit long' })
  code: string; // 244823

  @ApiProperty({
    required: true,
    description: 'OTP Reference',
    example: '3d617878-7c58-4963-9a5f-f709a6133653',
  })
  @IsDefined({ message: 'OTP Ref is required' })
  @IsUUID('4', { message: 'Invalid OTP Reference' })
  otpRef: string;

  @ApiProperty({
    required: true,
    example: '698765294',
    description: 'Client phone or email',
  })
  @IsDefined({ message: 'identifier is required' })
  @IsString()
  identifier: string;
}
