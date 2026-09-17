import type { Role, VendorType, VerificationStatus } from './roles';

export interface UserPublic {
  id: string;
  phone: string;
  role: Role;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  isPhoneVerified: boolean;
  createdAt: string;
}

export interface VendorProfilePublic {
  id: string;
  businessName: string;
  vendorType: VendorType;
  categoryTags: string[];
  nationalId: string | null;
  verificationStatus: VerificationStatus;
  description: string | null;
  socialLinks: Record<string, string>;
  isHomeBased: boolean;
}

export interface AuthTokens {
  accessToken: string;
  expiresIn: number;
}

export interface RequestOtpResponse {
  phone: string;
  maskedPhone: string;
  expiresInSeconds: number;
  retryAfterSeconds: number;
}

export interface VerifyOtpResponse {
  user: UserPublic;
  tokens: AuthTokens;
  vendorProfile: VendorProfilePublic | null;
  requiresProfileCompletion: boolean;
}

export interface RefreshResponse {
  user: UserPublic;
  tokens: AuthTokens;
}
