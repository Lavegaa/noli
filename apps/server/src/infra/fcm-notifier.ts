import { Injectable } from '@nestjs/common';
import { getMessaging } from 'firebase-admin/messaging';
import type { Notifier } from '../common/ports.js';
import { firebaseApp } from './firebase.js';

/** 기기는 로그인 후 `account_<id>` FCM 토픽을 구독한다. */
@Injectable()
export class FcmNotifier implements Notifier {
  async notify(accountId: string, title: string, body: string): Promise<void> {
    await getMessaging(firebaseApp()).send({
      topic: `account_${accountId}`,
      notification: { title, body },
    });
  }
}
