import { SetMetadata } from '@nestjs/common';

export const SKIP_CHANGE_REASON = 'skipChangeReason';

/**
 * Exempts a mutating route from the `x-change-reason` requirement.
 *
 * For writes where "why" is not a question anybody can answer: signing in,
 * asking for an OTP, an inbound webhook. Everything a staff member does to
 * business data explains itself.
 */
export const SkipChangeReason = () => SetMetadata(SKIP_CHANGE_REASON, true);
