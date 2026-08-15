import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppRequest } from 'src/dto/request-data.dto';
import { SKIP_CHANGE_REASON } from '../decorator/skip-change-reason.decorator';

/** The methods that change something and therefore owe the trail an answer. */
const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

export const CHANGE_REASON_HEADER = 'x-change-reason';
export const MIN_REASON_LENGTH = 3;
export const MAX_REASON_LENGTH = 500;

/**
 * Every mutating request states why it is being made.
 *
 * The reason rides in a header rather than in each body because it is the same
 * question on all of them, and because DELETE has nowhere good to put a body —
 * one header keeps intake uniform across every verb and lets a client set it in
 * one place, the way `x-idempotency-key` already works. Guards read it into
 * `request.data.reason`; each audited write passes it to the history hook.
 *
 * Runs after ApiClientGuard (it writes onto the `request.data` that guard
 * creates), and skips routes marked @SkipChangeReason() — sign-in, OTP,
 * webhooks — where there is no human intent to record.
 */
@Injectable()
export class ChangeReasonGuard implements CanActivate {
  private readonly logger = new Logger(ChangeReasonGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const request = context.switchToHttp().getRequest<AppRequest>();
    if (!MUTATING_METHODS.has(request.method)) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CHANGE_REASON, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const raw = request.headers[CHANGE_REASON_HEADER];
    const reason = (Array.isArray(raw) ? raw[0] : raw)?.trim();

    if (!reason || reason.length < MIN_REASON_LENGTH) {
      this.logger.error(
        `${request.method} ${request.url} rejected: no ${CHANGE_REASON_HEADER}`,
      );
      throw new BadRequestException({
        code: 'CHANGE_REASON_REQUIRED',
        field: CHANGE_REASON_HEADER,
        message:
          `Every change must say why it was made. Send a ${CHANGE_REASON_HEADER} ` +
          `header of at least ${MIN_REASON_LENGTH} characters.`,
      });
    }

    if (reason.length > MAX_REASON_LENGTH) {
      throw new BadRequestException({
        code: 'CHANGE_REASON_TOO_LONG',
        field: CHANGE_REASON_HEADER,
        message: `${CHANGE_REASON_HEADER} cannot exceed ${MAX_REASON_LENGTH} characters`,
      });
    }

    // `data` is created by ApiClientGuard; a skipped-api-key route may not have
    // one, and the reason is still worth carrying if it does.
    if (request.data) request.data.reason = reason;
    return true;
  }
}
