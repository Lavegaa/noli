import { Module, type OnApplicationBootstrap } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { GachaController } from './gacha.controller.js';
import { GachaService } from './gacha.service.js';
import { seedSwitchCatalog } from './switch-catalog.js';

@Module({
  controllers: [GachaController],
  providers: [GachaService],
})
export class GachaModule implements OnApplicationBootstrap {
  constructor(private readonly prisma: PrismaService) {}

  /** 새 계정 생성이 카탈로그 행에 기대므로, 시드를 빠뜨려도 부팅 때 맞춘다(멱등). */
  async onApplicationBootstrap(): Promise<void> {
    await seedSwitchCatalog(this.prisma);
  }
}
