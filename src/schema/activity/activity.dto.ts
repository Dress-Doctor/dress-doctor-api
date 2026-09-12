/** Did the action the row describes succeed? */
export enum ActivityOutcomeEnum {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

/**
 * What kind of thing the actor did. Deliberately coarse: the precise verb
 * lives in `action` (`order.create`, `auth.login`), this is the axis a
 * reviewer filters on when they do not yet know what they are looking for.
 */
export enum ActivityKindEnum {
  /** Created, edited, cancelled or deleted a record. Written by the audit hook. */
  WRITE = 'WRITE',
  /** Signed in or out, asked for an OTP, refreshed a session. */
  AUTH = 'AUTH',
  /** Pulled records out of the platform — a CSV/Excel export or a report. */
  EXPORT = 'EXPORT',
}
