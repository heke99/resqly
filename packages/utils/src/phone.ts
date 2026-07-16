/**
 * Normalize a phone number to E.164. Swedish local numbers are converted from
 * 07... / 0... to +46.... Other countries must be supplied with + or 00.
 */
export function normalizePhoneE164(value: string, defaultCountryCode = "46"): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let compact = trimmed.replace(/[\s().-]/g, "");
  if (compact.startsWith("00")) compact = `+${compact.slice(2)}`;
  if (compact.startsWith("0")) compact = `+${defaultCountryCode}${compact.slice(1)}`;
  if (!compact.startsWith("+")) return null;

  const digits = compact.slice(1);
  if (!/^\d{8,15}$/.test(digits) || digits.startsWith("0")) return null;
  return `+${digits}`;
}

export function isValidPhoneE164(value: string): boolean {
  return normalizePhoneE164(value) === value;
}
