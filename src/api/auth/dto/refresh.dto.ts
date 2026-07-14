import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    required: true,
    description: 'The refresh token issued at login',
    example: 'a1b2c3…',
  })
  @IsDefined({ message: 'Refresh token is required' })
  @IsString({ message: 'Refresh token must be a string' })
  refreshToken: string;
}
