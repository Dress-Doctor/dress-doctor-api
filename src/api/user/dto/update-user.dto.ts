import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { GenderEnum, PreferredLanguageEnum } from 'src/schema/user/user.dto';

export class UpdateUserDto {
  @ApiProperty({ required: false, example: 'John' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  firstName?: string;

  @ApiProperty({ required: false, example: 'Deo' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  lastName?: string;

  @ApiProperty({ required: false, example: 'john@example.com' })
  @IsOptional()
  @IsEmail({}, { message: 'Email must be a valid email address' })
  email?: string;

  @ApiProperty({ required: false, example: '698765294' })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @MaxLength(9, { message: 'WhatsApp phone must be 9 digit long' })
  @MinLength(9, { message: 'WhatsApp phone must be 9 digit long' })
  whatsappPhone?: string;

  @ApiProperty({ required: false, example: PreferredLanguageEnum.ENGLISH })
  @IsOptional()
  @IsEnum(PreferredLanguageEnum, {
    message: 'Preferred language must be one of these (en, fr)',
  })
  preferredLanguage?: PreferredLanguageEnum;

  @ApiProperty({ required: false, example: GenderEnum.MALE })
  @IsOptional()
  @IsEnum(GenderEnum, { message: 'Gender must be one of these (Male, Female)' })
  gender?: GenderEnum;
}
