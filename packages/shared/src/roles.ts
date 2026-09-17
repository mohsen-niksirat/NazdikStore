export const ROLES = ['CONSUMER', 'VENDOR', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export const VENDOR_TYPES = [
  'MEDICAL',
  'FOOD',
  'ECOMMERCE',
  'FIELD_SERVICE',
  'BEAUTY',
] as const;
export type VendorType = (typeof VENDOR_TYPES)[number];

export const VERIFICATION_STATUSES = [
  'UNVERIFIED',
  'PENDING',
  'VERIFIED',
  'REJECTED',
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isVendorType(value: unknown): value is VendorType {
  return typeof value === 'string' && (VENDOR_TYPES as readonly string[]).includes(value);
}
