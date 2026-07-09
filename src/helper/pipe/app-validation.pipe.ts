import {
  BadRequestException,
  Logger,
  ValidationError,
  ValidationPipe,
} from '@nestjs/common';
import constant from '../constant';

const logger = new Logger('AppValidationPipe');

export const AppValidationPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: true,
  exceptionFactory: (errors) => {
    const error = findFirstError(errors);
    if (!error?.constraints) {
      logger.error(constant.SERVER_ERROR);
      new BadRequestException(constant.SERVER_ERROR);
      return;
    }

    const message = Object.values(error.constraints)[0];
    logger.error(message, JSON.stringify(error));
    return new BadRequestException(message);
  },
});

function findFirstError(errors: ValidationError[]): ValidationError | null {
  if (!errors || errors.length === 0) return null;

  let current = errors[0];
  while (current) {
    const constraints = current.constraints;
    if (constraints && Object.keys(constraints).length > 0) return current;

    const children = current.children;
    if (children && children.length > 0) current = children[0];
    else break;
  }

  return null;
}
