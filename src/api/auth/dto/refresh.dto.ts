import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class RefreshTokenDto {
  /**
   * Optional because browser clients hold the refresh token in an HttpOnly
   * cookie they cannot read. The controller rejects the request when neither
   * source supplies one.
   */
  @ApiProperty({
    required: false,
    description:
      'The refresh token issued at login. Omit it when the HttpOnly cookie is present.',
    example: 'a1b2c3…',
  })
  @IsOptional()
  @IsString({ message: 'Refresh token must be a string' })
  refreshToken?: string;
}
