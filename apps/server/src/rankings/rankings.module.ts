import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module.js';
import { RankingsController } from './rankings.controller.js';
import { RankingsService } from './rankings.service.js';

@Module({
  imports: [FriendsModule],
  controllers: [RankingsController],
  providers: [RankingsService],
})
export class RankingsModule {}
