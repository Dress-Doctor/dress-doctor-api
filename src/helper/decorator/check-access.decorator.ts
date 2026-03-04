import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { CheckAccessGuard } from '../guard/check-access.guard';

export enum CheckTypeEnum {
  customerPickup = 'customer-pickup',
}

export type SourceDto = 'param' | 'body' | 'query';

export function CheckAccess(
  checkType: CheckTypeEnum,
  paramKey: string,
  source: SourceDto,
) {
  return applyDecorators(
    SetMetadata('checkType', checkType.toString()),
    SetMetadata('paramKey', paramKey),
    SetMetadata('source', source),
    UseGuards(CheckAccessGuard),
  );
}
