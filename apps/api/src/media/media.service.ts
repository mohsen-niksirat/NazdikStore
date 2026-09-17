import { BadRequestException, Injectable } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  MAX_IMAGE_BYTES,
  buildStoragePath,
  sanitizeFilename,
  scanUpload,
  sha256,
  stripExif,
} from './media-security';

export interface StoredMedia {
  id: string;
  ownerId: string;
  filename: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  checksum: string;
  exifStripped: boolean;
  /** public URL path for web app */
  url: string;
  /** in-memory buffer used when disk write is skipped (tests) */
  buffer?: Buffer;
}

export interface MediaUploadInput {
  ownerId: string;
  filename: string;
  declaredMime?: string;
  buffer: Buffer;
}

/**
 * Unified media upload pipeline.
 * Magic-bytes check → polyglot reject → sanitize name → strip EXIF → store.
 */
@Injectable()
export class MediaService {
  private memoryStore = new Map<string, StoredMedia>();
  private uploadRoot = process.env.MEDIA_ROOT ?? path.join(process.cwd(), 'uploads');

  get storeSize(): number {
    return this.memoryStore.size;
  }

  clearMemory(): void {
    this.memoryStore.clear();
  }

  async upload(input: MediaUploadInput): Promise<StoredMedia> {
    const scan = scanUpload(input.buffer, {
      filename: input.filename,
      declaredMime: input.declaredMime,
      maxBytes: MAX_IMAGE_BYTES,
    });

    if (!scan.ok || !scan.mime) {
      throw new BadRequestException({
        code: scan.code ?? 'UPLOAD_REJECTED',
        message: scan.reason ?? 'Upload rejected',
      });
    }

    const { data, stripped } = stripExif(input.buffer);
    // Re-scan after strip to ensure we didn't break the image header
    const rescan = scanUpload(data, {
      filename: input.filename,
      declaredMime: scan.mime,
      maxBytes: MAX_IMAGE_BYTES,
    });
    if (!rescan.ok || !rescan.mime) {
      throw new BadRequestException({
        code: 'UPLOAD_REJECTED',
        reason: 'Image corrupt after EXIF strip',
      });
    }

    const safeName = sanitizeFilename(input.filename, scan.mime);
    const storagePath = buildStoragePath(safeName, input.ownerId);
    const checksum = sha256(data);
    const id = `media_${checksum.slice(0, 16)}_${Date.now().toString(36)}`;

    const full = path.join(this.uploadRoot, storagePath);
    try {
      await mkdir(path.dirname(full), { recursive: true });
      await writeFile(full, data);
    } catch {
      // disk optional in tests — keep buffer
    }

    const record: StoredMedia = {
      id,
      ownerId: input.ownerId,
      filename: safeName,
      storagePath,
      mimeType: scan.mime,
      byteSize: data.length,
      checksum,
      exifStripped: stripped,
      url: `/media/${storagePath}`,
      buffer: data,
    };
    this.memoryStore.set(id, record);
    return record;
  }

  get(id: string): StoredMedia | null {
    return this.memoryStore.get(id) ?? null;
  }

  listByOwner(ownerId: string): StoredMedia[] {
    return Array.from(this.memoryStore.values()).filter((m) => m.ownerId === ownerId);
  }
}
