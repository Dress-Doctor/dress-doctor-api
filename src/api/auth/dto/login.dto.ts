import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { OTPChannelEnum } from 'src/schema/otp/otp.dto';

export class InitiateLoginDto {
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
    required: true,
    description: 'OTP channel',
    example: OTPChannelEnum.WHATSAPP,
  })
  @IsDefined({ message: 'OTP channel is required' })
  @IsEnum(OTPChannelEnum, {
    message: 'OTP channel must be either (Email WhatsApp)',
  })
  otpChannel: OTPChannelEnum;

  @ApiProperty({
    required: false,
    example: 'password',
    description: 'User password',
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
