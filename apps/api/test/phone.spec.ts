import {
  isValidIrMobile,
  normalizeIrMobile,
  toE164IrMobile,
  formatIrMobileDisplay,
  maskIrMobile,
} from '@nazdik/shared';

describe('Iranian phone utilities', () => {
  describe('isValidIrMobile', () => {
    it.each([
      '09123456789',
      '+989123456789',
      '00989123456789',
      '989123456789',
      '0912 345 6789',
      '0912-345-6789',
    ])('accepts %s', (raw) => {
      expect(isValidIrMobile(raw)).toBe(true);
    });

    it.each([
      '0912345678',
      '08123456789',
      '1234567890',
      '091234567890',
      '',
      'abc',
      '0912345678a',
    ])('rejects %s', (raw) => {
      expect(isValidIrMobile(raw)).toBe(false);
    });
  });

  describe('normalizeIrMobile', () => {
    it.each([
      ['09123456789', '09123456789'],
      ['+989123456789', '09123456789'],
      ['00989123456789', '09123456789'],
      ['989123456789', '09123456789'],
      ['+98 912 345 6789', '09123456789'],
    ])('normalizes %s → %s', (raw, expected) => {
      expect(normalizeIrMobile(raw)).toBe(expected);
    });

    it('throws on invalid input', () => {
      expect(() => normalizeIrMobile('123')).toThrow('INVALID_IR_MOBILE');
    });
  });

  describe('toE164IrMobile', () => {
    it('converts local to +98 form', () => {
      expect(toE164IrMobile('09123456789')).toBe('+989123456789');
    });
  });

  describe('display helpers', () => {
    it('formats for UI', () => {
      expect(formatIrMobileDisplay('09123456789')).toBe('0912 345 6789');
    });

    it('masks middle digits', () => {
      expect(maskIrMobile('09123456789')).toBe('0912 *** 6789');
    });
  });
});
