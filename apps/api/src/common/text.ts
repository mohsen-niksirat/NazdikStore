import { Injectable } from '@nestjs/common';
import { ERROR_CODES } from '@nazdik/shared';

export function sanitizeRichTextSafe(input: string, maxLen = 2000): string {
  return String(input ?? '')
    .slice(0, maxLen)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
}

export { ERROR_CODES };
