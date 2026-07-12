import { MongoAbility } from '@casl/ability';
import { Request } from 'express';
import { AppAbilityDto, ConditionsDto } from 'src/helper/casl/casl.dto';

export class JWTUserDto {
  iat: number;
  exp: number;
  sub: string; // userId
  phone: string;
  userType: string; // UserType.userTypeName (e.g. CUSTOMER, ADMIN)
  office?: string; // caller's office context (ObjectId as string), if any
}

export type RequestDto = {
  user: JWTUserDto;
} & Request;

export type UserRequestDto = {
  phone: string;
  userId: string;
  userType?: string;
  office?: string;
  ability: MongoAbility<AppAbilityDto, ConditionsDto>;
};
