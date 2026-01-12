import { Request } from 'express';

export class JWTUserDto {
  iat: number;
  exp: number;
  sub: string;
  phone: string;
}

export type RequestDto = {
  user: JWTUserDto;
} & Request;
