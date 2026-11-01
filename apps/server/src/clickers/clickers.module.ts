import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ClickersController } from './clickers.controller.js';
import { ClickersService } from './clickers.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [ClickersController],
  providers: [ClickersService],
  exports: [ClickersService],
})
export class ClickersModule {}
