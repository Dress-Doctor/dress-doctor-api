import { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import {
  ActivityKindEnum,
  ActivityOutcomeEnum,
} from 'src/schema/activity/activity.dto';

/** One thing a user did, as the recorder receives it. */
export interface ActivityEntryDto {
  userId: Types.ObjectId;
  officeId?: Types.ObjectId;
  kind: ActivityKindEnum;
  action: string;
  resource: string;
  resourceId?: Types.ObjectId;
  resourceRef?: string;
  outcome?: ActivityOutcomeEnum;
  reason?: string;
  requestId?: string;
  platform?: string;
  ip?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
  /** Join the caller's transaction, so a rolled-back write records nothing. */
  session?: ClientSession;
}

export type ActivityRecorder = (entry: ActivityEntryDto) => Promise<void>;

let recorder: ActivityRecorder | undefined;

/**
 * The audit hook runs inside `schema/`, which may not import from `api/` and
 * has no injector of its own — the schema modules build their models in
 * `useFactory` calls, so threading a service through all 26 of them would mean
 * 26 more `inject` entries. Instead ActivityService registers itself here at
 * boot and the hook calls whatever is registered.
 *
 * Unregistered is a valid state: unit tests construct schemas without an app,
 * and a write must never fail because nothing was listening.
 */
export function setActivityRecorder(fn: ActivityRecorder | undefined): void {
  recorder = fn;
}

/** Fire an activity row if anything is listening. Never throws. */
export async function recordActivity(entry: ActivityEntryDto): Promise<void> {
  await recorder?.(entry);
}
