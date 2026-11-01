import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller.js';
import { InfraModule } from './infra/infra.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [PrismaModule, InfraModule],
  controllers: [HealthController],
})
export class AppModule {}
