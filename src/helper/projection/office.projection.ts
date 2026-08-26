/**
 * Allow-list of Office fields safe to return alongside another resource.
 *
 * The office's `signedLink` carries an HMAC and its `qrCodeUrl` encodes the
 * same link — neither may leak through a join. Shared by every list that
 * embeds an office (order, payment, pickup, customer) so one allow-list
 * governs them all, and a field added to the schema stays out until it is
 * added here deliberately.
 */
export const SAFE_OFFICE_PROJECTION = {
  officeTypeId: 1,
  officeName: 1,
  officeCode: 1,
  slug: 1,
  address: 1,
  city: 1,
  region: 1,
  isActive: 1,
} as const;

/** The same allow-list as a `populate({ select })` string. */
export const SAFE_OFFICE_SELECT = Object.keys(SAFE_OFFICE_PROJECTION).join(' ');
