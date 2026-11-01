import { Module } from '@nestjs/common';
import { ClickersModule } from '../clickers/clickers.module.js';
import { FriendsModule } from '../friends/friends.module.js';
import { NewsModule } from '../news/news.module.js';
import { PlaysController } from './plays.controller.js';
import { PlaysService } from './plays.service.js';

@Module({
  imports: [ClickersModule, FriendsModule, NewsModule],
  controllers: [PlaysController],
  providers: [PlaysService],
})
export class PlaysModule {}
