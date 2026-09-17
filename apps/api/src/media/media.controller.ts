import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { MediaService } from './media.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('media')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @Post('upload')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Upload image (magic-bytes, 5MB, EXIF stripped)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 + 1024 } }))
  async upload(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file?: { originalname?: string; mimetype?: string; buffer?: Buffer },
  ) {
    if (!file?.buffer) {
      return {
        success: false,
        error: { code: 'EMPTY_FILE', message: 'file field required' },
      };
    }
    const stored = await this.media.upload({
      ownerId: user.id,
      filename: file.originalname ?? 'upload.jpg',
      declaredMime: file.mimetype,
      buffer: file.buffer,
    });
    return {
      success: true,
      data: {
        id: stored.id,
        url: stored.url,
        mimeType: stored.mimeType,
        byteSize: stored.byteSize,
        exifStripped: stored.exifStripped,
        filename: stored.filename,
      },
    };
  }
}
