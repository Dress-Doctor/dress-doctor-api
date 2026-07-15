import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PreferredLanguageEnum } from 'src/schema/user/user.dto';

/** Self-service profile edit (§2.3) — contact + preferences only. */
export class UpdateProfileDto {
  @ApiProperty({ required: false, example: '237698765294' })
  @IsOptional()
  @IsNumberString({ no_symbols: true })
  @MaxLength(15)
  whatsappPhone?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false, enum: PreferredLanguageEnum })
  @IsOptional()
  @IsEnum(PreferredLanguageEnum)
  preferredLanguage?: PreferredLanguageEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  pickupAddress?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  notificationsOptIn?: boolean;
}
