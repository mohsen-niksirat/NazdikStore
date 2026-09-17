/**
 * Phase 3 media safety pipeline — pure functions (no I/O).
 * Magic-byte MIME detection, filename sanitization, polyglot rejection,
 * EXIF GPS stripping for JPEG.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedImageMime = (typeof ALLOWED_IMAGE_MIME)[number];

export interface MediaScanResult {
  ok: boolean;
  mime: AllowedImageMime | null;
  reason?: string;
  code?: string;
}

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIG = Buffer.from([0xff, 0xd8, 0xff]);
// RIFF....WEBP
const WEBP_RIFF = Buffer.from('RIFF');
const WEBP_WEBP = Buffer.from('WEBP');

export function detectImageMime(buf: Buffer): AllowedImageMime | null {
  if (!buf || buf.length < 12) return null;
  if (buf.subarray(0, 3).equals(JPEG_SIG)) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(PNG_SIG)) return 'image/png';
  if (buf.subarray(0, 4).equals(WEBP_RIFF) && buf.subarray(8, 12).equals(WEBP_WEBP)) {
    return 'image/webp';
  }
  return null;
}

/** Heuristic polyglot / script-in-image detection */
export function looksMalicious(buf: Buffer, claimedMime?: string): boolean {
  // SVG anywhere near the start (even if extension is .jpg)
  const head = buf.subarray(0, Math.min(buf.length, 2048)).toString('utf8');
  if (/\<svg[\s>]/i.test(head) || /\<\?xml[\s\S]*\<svg/i.test(head)) return true;
  if (/\<script[\s>]/i.test(head)) return true;
  if (/javascript:/i.test(head)) return true;
  // HTML polyglot
  if (/\<html[\s>]/i.test(head) || /\<!DOCTYPE html/i.test(head)) return true;
  // PHP / ELF / PE
  if (head.startsWith('<?php')) return true;
  if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return true;
  if (buf[0] === 0x4d && buf[1] === 0x5a) return true; // MZ
  // GIFAR / ZIP polyglot
  if (buf.subarray(0, 2).toString('latin1') === 'PK') return true;
  // Claimed image but bytes are clearly not any allowed image → suspicious
  // (mismatch against a *valid other image* is handled as MIME_MISMATCH in scanUpload)
  const sniffed = detectImageMime(buf);
  if (claimedMime?.startsWith('image/') && !sniffed) return true;
  return false;
}

export function scanUpload(
  buf: Buffer,
  opts: { filename: string; declaredMime?: string; maxBytes?: number },
): MediaScanResult {
  const max = opts.maxBytes ?? MAX_IMAGE_BYTES;

  if (!buf || buf.length === 0) {
    return { ok: false, mime: null, code: 'EMPTY_FILE', reason: 'File is empty' };
  }
  if (buf.length > max) {
    return {
      ok: false,
      mime: null,
      code: 'FILE_TOO_LARGE',
      reason: `Max ${max} bytes`,
    };
  }

  if (looksMalicious(buf, opts.declaredMime)) {
    return {
      ok: false,
      mime: null,
      code: 'MALICIOUS_PAYLOAD',
      reason: 'Polyglot or script content detected',
    };
  }

  const mime = detectImageMime(buf);
  if (!mime) {
    return {
      ok: false,
      mime: null,
      code: 'UNSUPPORTED_MIME',
      reason: 'Not a supported image (jpeg/png/webp)',
    };
  }
  if (!(ALLOWED_IMAGE_MIME as readonly string[]).includes(mime)) {
    return { ok: false, mime: null, code: 'UNSUPPORTED_MIME', reason: 'MIME not allowed' };
  }
  if (opts.declaredMime && opts.declaredMime !== mime) {
    // Allow image/jpg alias
    const alias =
      (opts.declaredMime === 'image/jpg' && mime === 'image/jpeg') ||
      (opts.declaredMime.startsWith('image/') && opts.declaredMime === mime);
    if (!alias) {
      return {
        ok: false,
        mime,
        code: 'MIME_MISMATCH',
        reason: `Declared ${opts.declaredMime} but bytes are ${mime}`,
      };
    }
  }

  return { ok: true, mime };
}

/**
 * Sanitize upload filename: strip path traversal, control chars, keep safe stem + real ext.
 */
export function sanitizeFilename(original: string, mime: AllowedImageMime): string {
  const ext = mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : 'webp';
  let base = String(original || 'upload')
    .replace(/\\/g, '/')
    .split('/')
    .pop() as string;
  base = base
    .replace(/\0/g, '')
    .replace(/\.\./g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_{2,}/g, '_')
    .replace(/^[._-]+/, '')
    .slice(0, 80);
  if (!base || base === `.${ext}`) base = `upload.${ext}`;
  // Force extension to match sniffed mime
  base = base.replace(/\.[A-Za-z0-9]{1,8}$/, '');
  return `${base}.${ext}`;
}

/** Deterministic storage path — no user-controlled directories */
export function buildStoragePath(filename: string, ownerId: string, now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const safeOwner = String(ownerId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40) || 'anon';
  return `${y}/${m}/${safeOwner}/${filename}`;
}

/**
 * Strip EXIF GPS (and ideally all APP1 EXIF) from JPEG.
 * Non-JPEG returned unchanged. Minimal decoder: drop APP1/APP2 segments
 * that are not needed for rendering; keep SOF/DHT/DQT/SOS/image data.
 */
export function stripExif(buf: Buffer): { data: Buffer; stripped: boolean } {
  if (!buf.subarray(0, 3).equals(JPEG_SIG)) {
    return { data: buf, stripped: false };
  }
  const out: Buffer[] = [buf.subarray(0, 2)]; // SOI
  let i = 2;
  let stripped = false;
  while (i < buf.length - 1) {
    if (buf[i] !== 0xff) {
      // unexpected — copy rest
      out.push(buf.subarray(i));
      break;
    }
    const marker = buf[i + 1];
    // Padding
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    // EOI
    if (marker === 0xd9) {
      out.push(buf.subarray(i));
      break;
    }
    // Standalone markers without length
    if (marker === 0xd0 || marker === 0xd1 || marker === 0xd2 || marker === 0xd3 || marker === 0xd4 || marker === 0xd5 || marker === 0xd6 || marker === 0xd7 || marker === 0x01) {
      out.push(buf.subarray(i, i + 2));
      i += 2;
      continue;
    }
    if (i + 3 >= buf.length) {
      out.push(buf.subarray(i));
      break;
    }
    const segLen = buf.readUInt16BE(i + 2);
    if (segLen < 2 || i + 2 + segLen > buf.length) {
      out.push(buf.subarray(i));
      break;
    }
    // APP1 (EXIF/XMP), APP2 (ICC sometimes keep — we drop APP1 GPS primarily)
    if (marker === 0xe1) {
      stripped = true;
      i += 2 + segLen; // skip APP1
      continue;
    }
    // SOS — copy remainder
    if (marker === 0xda) {
      out.push(buf.subarray(i));
      break;
    }
    out.push(buf.subarray(i, i + 2 + segLen));
    i += 2 + segLen;
  }
  return { data: Buffer.concat(out), stripped };
}

export function sha256(buf: Buffer): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(buf).digest('hex');
}

export function sanitizeRichText(input: string, maxLen = 2000): string {
  return String(input ?? '')
    .slice(0, maxLen)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
}
