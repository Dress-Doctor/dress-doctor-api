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
import { GenderEnum } from 'src/schema/user/user.dto';

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

  @ApiProperty({ required: true, example: '698765294' })
  @IsDefined({ message: 'Phone is required' })
  @IsNumberString({ no_symbols: true })
  @MaxLength(9, { message: 'Phone must be 9 digit long' })
  @MinLength(9, { message: 'Phone must be 9 digit long' })
  phone: string;

  @ApiProperty({ required: true, example: '698765294' })
  @IsDefined({ message: 'WhatsApp phone is required' })
  @IsNumberString({ no_symbols: true })
  @MaxLength(9, { message: 'WhatsApp phone must be 9 digit long' })
  @MinLength(9, { message: 'WhatsApp phone must be 9 digit long' })
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
