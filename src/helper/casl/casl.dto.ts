import { createMongoAbility, MongoQuery } from '@casl/ability';
import { PermissionActionEnum, SubjectEnum } from 'src/schema/admin/admin.dto';

export type CaslActionsDto = `${PermissionActionEnum}`;
export type CaslSubjectsDto = `${SubjectEnum}`;

export type AppAbilityDto = [CaslActionsDto, CaslSubjectsDto];
export type ConditionsDto = MongoQuery;

export const AppAbility = createMongoAbility<AppAbilityDto, ConditionsDto>;
