import {
  BadRequestException,
  Logger,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import constant from '../constant';
import { ErrorDetail } from '../types/error.type';

const logger = new Logger('AppValidationPipe');

export const AppValidationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  exceptionFactory: (errors: ValidationError[]) => {
    const details = flattenValidationErrors(errors);

    if (details.length === 0) {
      logger.error(constant.SERVER_ERROR);
      return new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: constant.SERVER_ERROR,
      });
    }

    logger.error('Validation failed', JSON.stringify(details));
    return new BadRequestException({
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      details,
    });
  },
});

/**
 * Flattens class-validator errors (including nested children) into a flat list of
 * `{ field, message }`, one entry per failing constraint. Field paths are dotted
 * (e.g. `items.0.qty`) so the frontend can map each message onto its input.
 */
function flattenValidationErrors(
  errors: ValidationError[],
  parentPath = '',
): ErrorDetail[] {
  const details: ErrorDetail[] = [];

  for (const error of errors) {
    const field = parentPath
      ? `${parentPath}.${error.property}`
      : error.property;

    if (error.constraints) {
      for (const message of Object.values(error.constraints)) {
        details.push({ field, message });
      }
    }

    if (error.children && error.children.length > 0) {
      details.push(...flattenValidationErrors(error.children, field));
    }
  }

  return details;
}
