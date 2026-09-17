import { Module } from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
