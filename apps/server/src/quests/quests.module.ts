import { Module } from '@nestjs/common';
import { QuestsController } from './quests.controller.js';
import { QuestsListener } from './quests.listener.js';
import { QuestsService } from './quests.service.js';

@Module({
  controllers: [QuestsController],
  providers: [QuestsService, QuestsListener],
})
export class QuestsModule {}
