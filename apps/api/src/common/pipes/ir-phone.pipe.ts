import {
  BadRequestException,
  Injectable,
  PipeTransform,
} from '@nestjs/common';
import { ERROR_CODES, isValidIrMobile, normalizeIrMobile } from '@nazdik/shared';

/**
 * Validates Iranian mobile numbers on DTO fields named `phone`.
 * Accepts +98 / 0098 / 98 / 09... and normalizes to 09xxxxxxxxx.
 */
@Injectable()
export class IrPhonePipe implements PipeTransform<{ phone?: string }, { phone: string }> {
  transform(value: { phone?: string }) {
    if (!value || typeof value.phone !== 'string') {
      throw new BadRequestException({
        code: ERROR_CODES.PHONE_INVALID,
        message: 'phone is required',
      });
    }
    if (!isValidIrMobile(value.phone)) {
      throw new BadRequestException({
        code: ERROR_CODES.PHONE_INVALID,
        message: 'Invalid Iranian mobile number',
      });
    }
    return { ...value, phone: normalizeIrMobile(value.phone) };
  }
}
