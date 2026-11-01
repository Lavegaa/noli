import { Module } from '@nestjs/common';
import { BlocksService } from './blocks.service.js';

@Module({ providers: [BlocksService], exports: [BlocksService] })
export class BlocksModule {}
