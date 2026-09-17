import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { FeedService } from './feed.service';
import { ReviewsService } from '../reviews/reviews.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthUser, CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/roles.decorator';
import { ERROR_CODES } from '../common/text';
import { ForbiddenException } from '@nestjs/common';

class CreatePostDto {
  @IsString()
  @Length(1, 2000)
  caption!: string;

  @IsOptional()
  @IsArray()
  imageUrls?: string[];

  @IsOptional()
  @IsArray()
  productTags?: Array<{ productId: string; title: string; priceToman: number }>;
}

class CreateProductDto {
  @IsString()
  @Length(1, 120)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 1000)
  description?: string;

  @IsInt()
  @Min(0)
  priceToman!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}

class CreateReviewDto {
  @IsInt()
  @Min(1)
  rating!: number;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  body?: string;
}

class ReplyDto {
  @IsString()
  @Length(1, 1000)
  body!: string;
}

@ApiTags('feed')
@Controller()
export class FeedController {
  constructor(
    private readonly feed: FeedService,
    private readonly reviews: ReviewsService,
  ) {}

  @Public()
  @Get('feed')
  @ApiOperation({ summary: 'Local social feed of vendor posts' })
  feedList(@Query('limit') limit?: string) {
    const data = this.feed.listFeed(limit ? Number(limit) : 20);
    return { success: true, data };
  }

  @Public()
  @Get('vendors/:id/profile')
  @ApiOperation({ summary: 'Public vendor profile — bio, posts, products, reviews' })
  async profile(@Param('id') id: string) {
    await this.feed.tryLoadProfileFromDb(id);
    const summary = this.reviews.summaryForVendor(id);
    const data = this.feed.getVendorProfile(id, summary);
    return { success: true, data };
  }

  @Public()
  @Get('vendors/:id/reviews')
  @ApiOperation({ summary: 'Public verified reviews for a vendor' })
  reviewsList(@Param('id') id: string) {
    const data = this.reviews.listForVendor(id);
    return { success: true, data, summary: this.reviews.summaryForVendor(id) };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('vendors/me/posts')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create vendor timeline post (owner)' })
  createPost(@CurrentUser() user: AuthUser, @Body() dto: CreatePostDto) {
    const profileId = this.resolveVendorProfileId(user);
    const data = this.feed.createPost({
      vendorProfileId: profileId,
      caption: dto.caption,
      imageUrls: dto.imageUrls,
      productTags: dto.productTags,
    });
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('vendors/me/products')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create catalogue product (owner)' })
  createProduct(@CurrentUser() user: AuthUser, @Body() dto: CreateProductDto) {
    const profileId = this.resolveVendorProfileId(user);
    const data = this.feed.createProduct({
      vendorProfileId: profileId,
      title: dto.title,
      description: dto.description,
      priceToman: dto.priceToman,
      stock: dto.stock ?? null,
    });
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('vendors/:id/reviews')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Submit review — requires completed order/appointment',
  })
  async createReview(
    @CurrentUser() user: AuthUser,
    @Param('id') vendorProfileId: string,
    @Body() dto: CreateReviewDto,
  ) {
    const data = await this.reviews.createReview({
      vendorProfileId,
      consumerId: user.id,
      rating: dto.rating,
      body: dto.body,
    });
    return { success: true, data };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('vendors/me/reviews/:reviewId/reply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Vendor public reply to a review' })
  reply(
    @CurrentUser() user: AuthUser,
    @Param('reviewId') reviewId: string,
    @Body() dto: ReplyDto,
  ) {
    const profileId = this.resolveVendorProfileId(user);
    const data = this.reviews.replyToReview({
      reviewId,
      vendorProfileId: profileId,
      vendorUserId: user.id,
      body: dto.body,
    });
    return { success: true, data };
  }

  /**
   * Phase 3: map auth user → vendor profile id.
   * Memory mode uses `vp_${userId}` convention from seeds; DB path would look up VendorProfile.
   */
  private resolveVendorProfileId(user: AuthUser): string {
    if (user.role !== 'VENDOR' && user.role !== 'ADMIN') {
      throw new ForbiddenException({
        code: ERROR_CODES.FORBIDDEN,
        message: 'Vendor role required',
      });
    }
    if (user.role === 'ADMIN') return `vp_admin_${user.id}`;
    return `vp_${user.id}`;
  }
}

/** Test/demo helper endpoints under seed paths are not public by default */
