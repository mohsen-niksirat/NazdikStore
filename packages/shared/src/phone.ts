/**
 * Iranian mobile phone utilities.
 * Canonical local form: 09xxxxxxxxx (11 digits)
 * Canonical international: +989xxxxxxxxx
 */

const IR_MOBILE_REGEX = /^(?:\+98|0098|98|0)?9\d{9}$/;

export function isValidIrMobile(raw: string): boolean {
  if (typeof raw !== 'string') return false;
  const cleaned = raw.replace(/[\s\-().]/g, '');
  return IR_MOBILE_REGEX.test(cleaned);
}

/** Normalize any accepted form to local 09xxxxxxxxx */
export function normalizeIrMobile(raw: string): string {
  const cleaned = raw.replace(/[\s\-().]/g, '');
  if (!IR_MOBILE_REGEX.test(cleaned)) {
    throw new Error('INVALID_IR_MOBILE');
  }
  let digits = cleaned;
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('98')) digits = digits.slice(2);
  if (digits.startsWith('9')) digits = `0${digits}`;
  return digits;
}

/** Normalize to +989xxxxxxxxx for SMS providers */
export function toE164IrMobile(raw: string): string {
  const local = normalizeIrMobile(raw);
  return `+98${local.slice(1)}`;
}

/** Display form for UI: 0912 345 6789 */
export function formatIrMobileDisplay(raw: string): string {
  const local = normalizeIrMobile(raw);
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** Mask for OTP screens: 0912 *** 6789 */
export function maskIrMobile(raw: string): string {
  const local = normalizeIrMobile(raw);
  return `${local.slice(0, 4)} *** ${local.slice(7)}`;
}
