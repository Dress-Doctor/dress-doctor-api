import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinDate,
  MinLength,
} from 'class-validator';
import { PickupTimeEnum } from 'src/schema/pickup/pickup.dto';

export class CreatePickupDto {
  @ApiProperty({
    required: true,
    example: 'John',
    description: 'User first name',
  })
  @IsDefined({ message: 'First Name is required' })
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  @MaxLength(50, { message: 'First name must be less than 50 characters' })
  @Matches(/^[a-zA-Z]+$/, { message: 'First name must contain only letters' })
  firstName: string;

  @ApiProperty({
    required: true,
    example: 'Deo',
    description: 'User last name',
  })
  @IsDefined({ message: 'Last Name is required' })
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  @MaxLength(50, { message: 'Last name must be less than 50 characters' })
  @Matches(/^[A-Za-z]+( [A-Za-z]+)*$/, {
    message: 'Last name must contain only letters and single spaces',
  })
  lastName: string;

  @ApiProperty({
    required: false,
    example: 'john@example.com',
    description: 'User email address',
  })
  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email?: string;

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
    example: '698765294',
    description: 'User whatsapp phone number',
  })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @MaxLength(9, { message: 'WhatsApp phone must be 9 digit long' })
  @MinLength(9, { message: 'WhatsApp phone must be 9 digit long' })
  whatsappPhone: string;

  @ApiProperty({
    required: true,
    description: 'User address',
    example: '4 Etage - Bonaberi',
  })
  @IsDefined({ message: 'Your address is required' })
  @IsString({ message: 'Address must be a string' })
  pickupAddress: string;

  @ApiProperty({
    required: true,
    description: 'User pickup time',
    example: 'AFTERNOON 12PM - 5PM',
  })
  @IsDefined({ message: 'Pickup time is required' })
  @IsEnum(PickupTimeEnum, {
    message:
      'Pickup time must be one of these (MORNING 8AM - 12PM, AFTERNOON 12PM - 5PM, EVENING 5PM - 8PM)',
  })
  pickupTime: string;

  @ApiProperty({
    required: true,
    description: 'User pickup date',
    example: new Date().toISOString(),
  })
  @IsDefined({ message: 'Pickup date is required' })
  @Transform(
    ({ value }): Date =>
      typeof value === 'string' ? new Date(value) : (value as Date),
  )
  @MinDate(
    () => {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      return date;
    },
    { message: 'Pickup date must be greater than or equal to today.' },
  )
  pickupDate: Date;
}
