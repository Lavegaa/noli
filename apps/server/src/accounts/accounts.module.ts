import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { CapabilityGuard } from '../auth/capability.guard.js';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { AccountsController } from './accounts.controller.js';
import { AccountsService } from './accounts.service.js';

/** 전역 가드는 등록 순서대로 실행된다: 인증 -> 권한. */
@Module({
  imports: [InventoryModule],
  controllers: [AccountsController],
  providers: [
    AccountsService,
    { provide: APP_GUARD, useClass: FirebaseAuthGuard },
    { provide: APP_GUARD, useClass: CapabilityGuard },
  ],
  exports: [AccountsService],
})
export class AccountsModule {}
