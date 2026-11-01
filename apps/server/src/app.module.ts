import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AccountsModule } from './accounts/accounts.module.js';
import { ClickersModule } from './clickers/clickers.module.js';
import { FriendsModule } from './friends/friends.module.js';
import { HealthController } from './health/health.controller.js';
import { InfraModule } from './infra/infra.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { NewsModule } from './news/news.module.js';
import { PlaysModule } from './plays/plays.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RankingsModule } from './rankings/rankings.module.js';
import { ShareModule } from './share/share.module.js';

@Module({
  imports: [
    EventEmitterModule.forRoot(),
    PrismaModule,
    InfraModule,
    AccountsModule,
    InventoryModule,
    ClickersModule,
    FriendsModule,
    ShareModule,
    NewsModule,
    PlaysModule,
    RankingsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
