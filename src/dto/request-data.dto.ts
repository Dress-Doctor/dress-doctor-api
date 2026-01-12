import { type Request } from 'express';
import { Types } from 'mongoose';

export class RequestDataDto {
  language: 'en' | 'fr';
  platform: string;
  officeId: Types.ObjectId;
  apiClientId: Types.ObjectId;
}

export type AppRequest = Request & { data: RequestDataDto };
