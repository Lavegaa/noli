import { Module } from '@nestjs/common';
import { AccountsModule } from './accounts/accounts.module.js';
import { ClickersModule } from './clickers/clickers.module.js';
import { HealthController } from './health/health.controller.js';
import { InfraModule } from './infra/infra.module.js';
import { InventoryModule } from './inventory/inventory.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    PrismaModule,
    InfraModule,
    AccountsModule,
    InventoryModule,
    ClickersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
