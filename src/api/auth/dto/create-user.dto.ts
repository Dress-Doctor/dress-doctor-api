import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
  IsString,
  MinLength,
  MaxLength,
  Matches,
  IsOptional,
  IsEmail,
  IsNumberString,
  IsEnum,
  IsMongoId,
} from 'class-validator';
import { GenderEnum, PreferredLanguageEnum } from 'src/schema/user/user.dto';

export class CreateUserDto {
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
  whatsappPhone?: string;

  @ApiProperty({
    required: false,
    example: PreferredLanguageEnum.ENGLISH,
    description: 'User preferred language',
  })
  @IsOptional()
  @IsEnum(PreferredLanguageEnum, {
    message: 'Preferred language must be one of these (en, fr)',
  })
  preferredLanguage?: PreferredLanguageEnum;

  @ApiProperty({
    required: false,
    example: GenderEnum.MALE,
    description: 'User gender',
  })
  @IsOptional()
  @IsEnum(GenderEnum, { message: 'Gender must be one of these (Male, Female)' })
  gender?: GenderEnum;

  @ApiProperty({ required: true, description: 'User type id' })
  @IsDefined({ message: 'UserTypeId is required' })
  @IsMongoId({ message: 'Invalid userTypeId' })
  userTypeId: string;
}
