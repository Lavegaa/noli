import { Module } from '@nestjs/common';
import { GachaController } from './gacha.controller.js';
import { GachaService } from './gacha.service.js';

@Module({
  controllers: [GachaController],
  providers: [GachaService],
})
export class GachaModule {}
