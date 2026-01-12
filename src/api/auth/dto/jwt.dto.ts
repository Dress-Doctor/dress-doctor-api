import { MongoAbility } from '@casl/ability';
import { Request } from 'express';
import { AppAbilityDto, ConditionsDto } from 'src/helper/casl/casl.dto';

export class JWTUserDto {
  iat: number;
  exp: number;
  sub: string; // userId
  phone: string;
}

export type RequestDto = {
  user: JWTUserDto;
} & Request;

export type UserRequestDto = {
  phone: string;
  userId: string;
  ability: MongoAbility<AppAbilityDto, ConditionsDto>;
};
