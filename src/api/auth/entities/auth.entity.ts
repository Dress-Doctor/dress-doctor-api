import { ApiProperty } from '@nestjs/swagger';
import { Base } from 'src/dto/swagger.dto';
import { OTPPurposeEnum } from 'src/schema/otp/otp.dto';

class LoginDataEntity {
  @ApiProperty({
    required: true,
    example: false,
    description: 'Is otp used already',
  })
  isUsed: boolean;

  @ApiProperty({
    required: true,
    example: 'LOGIN',
    description: 'Purpose of the OTP code',
  })
  purpose: OTPPurposeEnum;

  @ApiProperty({
    required: true,
    example: '2026-01-12T03:41:59.432Z',
    description: 'The expiration date of the OTP code',
  })
  expiredAt: Date;

  @ApiProperty({
    required: true,
    example: 'WhatsApp',
    description: 'OTP channel',
  })
  channel: 'WhatsApp';
}

export class LoginEntity extends Base {
  @ApiProperty({
    required: true,
    description: 'A message describing the response',
    example: 'We have sent you a code to verify your phone.',
  })
  message: string;

  @ApiProperty({ required: true, type: LoginDataEntity })
  data: LoginDataEntity;
}
