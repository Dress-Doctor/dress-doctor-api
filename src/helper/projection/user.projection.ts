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
