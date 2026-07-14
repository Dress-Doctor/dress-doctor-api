/**
 * Mask a phone number for logs — keep the last 3 digits, star the rest, so
 * routine auth/OTP rejection logs don't leak full PII. `698765294` → `******294`.
 */
export function maskPhone(phone?: string): string {
  if (!phone) return 'unknown';
  if (phone.length <= 3) return '***';
  return `${'*'.repeat(phone.length - 3)}${phone.slice(-3)}`;
}

/**
 * Log-safe view of notification recipients: mask every address (phone or
 * email local-part is equally PII in bulk logs). `[{a:'6987...'}]` → `******294`.
 */
export function maskRecipients(
  recipients: { address: string }[] | string,
): string {
  if (typeof recipients === 'string') return maskPhone(recipients);
  return recipients.map((r) => maskPhone(r.address)).join(',');
}

/**
 * Log-safe view of template variables: keys only, never values. Values carry
 * OTP codes and customer PII (phone in the inactivity alert) — the key list is
 * enough to debug "which variables were present".
 */
export function variableKeys(variables?: Record<string, string>): string {
  return variables ? Object.keys(variables).join(',') : '';
}
