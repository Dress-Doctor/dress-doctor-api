export class RequestOtpDto {
  identifier: string;
  channel: OTPChannelEnum;
  purpose: OTPPurposeEnum;
}

export class VerifyOtpDto extends RequestOtpDto {
  code: string;
}

export enum OTPChannelEnum {
  EMAIL = 'Email',
  WHATSAPP = 'WhatsApp',
}

export enum OTPPurposeEnum {
  LOGIN = 'LOGIN',
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
}
