import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ROLES, VENDOR_TYPES } from '@nazdik/shared';

export class RequestOtpDto {
  @ApiProperty({ example: '09123456789' })
  @IsString()
  @Matches(/^(?:\+98|0098|98|0)?9\d{9}$/, {
    message: 'PHONE_INVALID',
  })
  phone!: string;
}

export class VerifyOtpDto {
  @ApiProperty({ example: '09123456789' })
  @IsString()
  @Matches(/^(?:\+98|0098|98|0)?9\d{9}$/, {
    message: 'PHONE_INVALID',
  })
  phone!: string;

  @ApiProperty({ example: '12345', minLength: 5, maxLength: 5 })
  @IsString()
  @Length(5, 5)
  @Matches(/^\d{5}$/, { message: 'OTP_INVALID' })
  code!: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class CompleteProfileDto {
  @ApiProperty({ enum: ROLES, example: 'VENDOR' })
  @IsIn(ROLES as unknown as string[])
  role!: (typeof ROLES)[number];

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  firstName?: string;

  @ApiPropertyOptional({ maxLength: 100 })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  lastName?: string;

  // Vendor fields (required when role === VENDOR)
  @ApiPropertyOptional({ example: 'آشپزخانه نزدیک' })
  @IsOptional()
  @IsString()
  @Length(2, 120)
  businessName?: string;

  @ApiPropertyOptional({ enum: VENDOR_TYPES })
  @IsOptional()
  @IsIn(VENDOR_TYPES as unknown as string[])
  vendorType?: (typeof VENDOR_TYPES)[number];

  @ApiPropertyOptional({ example: '0084575948' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{10}$/, { message: 'NATIONAL_ID_INVALID' })
  nationalId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  categoryTags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  isHomeBased?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  socialLinks?: Record<string, string>;
}
