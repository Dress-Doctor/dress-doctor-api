import { ApiProperty } from '@nestjs/swagger';
import { Base } from 'src/dto/swagger.dto';

class LoginDataEntity {
  @ApiProperty({
    required: true,
    example: '2026-01-12T03:41:59.432Z',
    description: 'The expiration date of the OTP code',
  })
  expiresAt: Date;

  @ApiProperty({
    required: true,
    description: 'OTP reference',
    example: '3d617878-7c58-4963-9a5f-f709a6133653',
  })
  otpRef: string;
}

export class InitiateLoginEntity extends Base {
  @ApiProperty({
    required: true,
    description: 'A message describing the response',
    example: 'We have sent you a code to verify your phone.',
  })
  message: string;

  @ApiProperty({ required: true, type: LoginDataEntity })
  data: LoginDataEntity;
}

export class CompleteLoginEntity extends Base {
  @ApiProperty({
    required: true,
    example: 'Login successful',
    description: 'A message describing the response',
  })
  message: string;

  @ApiProperty({
    required: true,
    example: 'JWT Token',
    description: 'Client token',
  })
  accessToken: string;
}
