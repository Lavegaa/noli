import { Module } from '@nestjs/common';
import { EquipController } from './equip.controller.js';
import { InventoryController } from './inventory.controller.js';
import { InventoryService } from './inventory.service.js';

@Module({
  controllers: [InventoryController, EquipController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}
