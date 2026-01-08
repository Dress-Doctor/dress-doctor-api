import { Query, Types } from 'mongoose';

export enum PreferredLanguageEnum {
  ENGLISH = 'en',
  FRENCH = 'fr',
}

export enum GenderEnum {
  MALE = 'Male',
  FEMALE = 'Female',
}

export enum OTPChannelEnum {
  EMAIL = 'Email',
  WHATSAPP = 'WhatsApp',
}

export enum OTPPurposeEnum {
  LOGIN = 'LOGIN',
  EMAIL_VERIFICATION = 'EMAIL_VERIFICATION',
}

export type ChangedFieldDto = { from: any; to: any };
