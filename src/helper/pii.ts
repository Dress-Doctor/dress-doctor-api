/**
 * Mask a phone number for logs — keep the last 3 digits, star the rest, so
 * routine auth/OTP rejection logs don't leak full PII. `698765294` → `******294`.
 */
export function maskPhone(phone?: string): string {
  if (!phone) return 'unknown';
  if (phone.length <= 3) return '***';
  return `${'*'.repeat(phone.length - 3)}${phone.slice(-3)}`;
}
