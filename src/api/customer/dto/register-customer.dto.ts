import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsEmail,
  IsEnum,
  IsMongoId,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PHONE_MAX_DIGITS, PHONE_MIN_DIGITS } from 'src/helper/phone';
import { GenderEnum } from 'src/schema/user/user.dto';

const PHONE_LENGTH_MESSAGE =
  `Phone must be ${PHONE_MIN_DIGITS}-${PHONE_MAX_DIGITS} digits, ` +
  'country code included';
const WHATSAPP_LENGTH_MESSAGE =
  `WhatsApp phone must be ${PHONE_MIN_DIGITS}-${PHONE_MAX_DIGITS} digits, ` +
  'country code included';

export class RegisterCustomerDto {
  @ApiProperty({ required: true, example: 'John' })
  @IsDefined({ message: 'First name is required' })
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  @MaxLength(50, { message: 'First name must be less than 50 characters' })
  firstName: string;

  @ApiProperty({ required: true, example: 'Deo' })
  @IsDefined({ message: 'Last name is required' })
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  @MaxLength(50, { message: 'Last name must be less than 50 characters' })
  lastName: string;

  @ApiProperty({
    required: true,
    example: '237698765294',
    description:
      'Digits with the country code, no symbols. A bare 9-digit number is ' +
      'taken as Cameroonian and stored with 237 in front of it.',
  })
  @IsDefined({ message: 'Phone is required' })
  @IsNumberString({ no_symbols: true })
  @MinLength(PHONE_MIN_DIGITS, { message: PHONE_LENGTH_MESSAGE })
  @MaxLength(PHONE_MAX_DIGITS, { message: PHONE_LENGTH_MESSAGE })
  phone: string;

  @ApiProperty({
    required: true,
    example: '12025550123',
    description:
      'Digits with the country code, no symbols. Need not share a country ' +
      'with `phone` — a customer in Douala may keep a foreign WhatsApp number.',
  })
  @IsDefined({ message: 'WhatsApp phone is required' })
  @IsNumberString({ no_symbols: true })
  @MinLength(PHONE_MIN_DIGITS, { message: WHATSAPP_LENGTH_MESSAGE })
  @MaxLength(PHONE_MAX_DIGITS, { message: WHATSAPP_LENGTH_MESSAGE })
  whatsappPhone: string;

  @ApiProperty({ required: false, example: 'john@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email?: string;

  @ApiProperty({ required: false, example: 'Bonapriso, Douala' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  pickupAddress?: string;

  @ApiProperty({ required: false, example: GenderEnum.MALE })
  @IsOptional()
  @IsEnum(GenderEnum, { message: 'Gender must be one of these (Male, Female)' })
  gender?: GenderEnum;

  @ApiProperty({
    required: false,
    description: 'Reporting-only home office id',
  })
  @IsOptional()
  @IsMongoId({ message: 'Invalid homeOfficeId' })
  homeOfficeId?: string;

  @ApiProperty({
    required: false,
    description: "Another customer's referral code",
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z0-9]{4,10}$/, { message: 'Invalid referral code' })
  referralCode?: string;
}
