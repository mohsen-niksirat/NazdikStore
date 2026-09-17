import { Module } from '@nestjs/common';
import { SeedService } from './seed.service';
import { MapModule } from '../map/map.module';
import { FeedModule } from '../feed/feed.module';
import { ReviewsModule } from '../reviews/reviews.module';

@Module({
  imports: [MapModule, FeedModule, ReviewsModule],
  providers: [SeedService],
})
export class SeedModule {}
