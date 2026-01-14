import { type Request } from 'express';
import { Types } from 'mongoose';
import { UserRequestDto } from 'src/api/auth/dto/jwt.dto';

export class RequestDataDto {
  language: 'en' | 'fr';
  platform: string;
  officeId: Types.ObjectId;
  apiClientId: Types.ObjectId;
}

export type AppRequest = Request & { data: RequestDataDto };
export type AppRequestWithUser = AppRequest & { user: UserRequestDto };
