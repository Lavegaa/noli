import { Module } from '@nestjs/common';
import { BlocksModule } from '../blocks/blocks.module.js';
import { ClickersModule } from '../clickers/clickers.module.js';
import { FriendsModule } from '../friends/friends.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { NewsModule } from '../news/news.module.js';
import { ShareController } from './share.controller.js';
import { ShareService } from './share.service.js';

@Module({
  imports: [
    ClickersModule,
    InventoryModule,
    FriendsModule,
    BlocksModule,
    NewsModule,
  ],
  controllers: [ShareController],
  providers: [ShareService],
})
export class ShareModule {}
