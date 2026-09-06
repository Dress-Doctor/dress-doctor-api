/**
 * Allow-list of non-sensitive User fields for any user joined onto another
 * resource (a customer, an order's creator, a pickup agent, a referrer).
 *
 * `passwordHash` and every other secret stay out by construction — never
 * switch this to an exclusion projection, which would leak whatever field the
 * schema grows next. Shared by every list that embeds a user so one allow-list
 * governs them all.
 */
export const SAFE_USER_PROJECTION = {
  reference: 1,
  firstName: 1,
  lastName: 1,
  phone: 1,
  whatsappPhone: 1,
  email: 1,
  gender: 1,
  preferredLanguage: 1,
  isActive: 1,
  userTypeId: 1,
} as const;

/** The same allow-list as a `populate({ select })` string. */
export const SAFE_USER_SELECT = Object.keys(SAFE_USER_PROJECTION).join(' ');

/**
 * The same allow-list plus the audit timestamps, for the screens that read the
 * user as a record in its own right — the admin user file and its detail page.
 *
 * Kept apart from `SAFE_USER_PROJECTION` because a user *joined onto* another
 * resource has no use for when that user's row was last written, and every
 * field added to an embedded payload is a field somebody has to keep safe.
 */
export const SAFE_USER_RECORD_PROJECTION = {
  ...SAFE_USER_PROJECTION,
  createdAt: 1,
  updatedAt: 1,
} as const;

/** The record allow-list as a `select()` string. */
export const SAFE_USER_RECORD_SELECT = Object.keys(
  SAFE_USER_RECORD_PROJECTION,
).join(' ');
