import { Injectable } from '@nestjs/common';
import { getAuth } from 'firebase-admin/auth';
import { AppError } from '../common/app-error.js';
import type { AuthVerifier } from '../common/ports.js';
import { firebaseApp } from './firebase.js';

@Injectable()
export class FirebaseAuthVerifier implements AuthVerifier {
  async verify(idToken: string): Promise<{ uid: string; providers: string[] }> {
    try {
      const decoded = await getAuth(firebaseApp()).verifyIdToken(idToken);
      const identities = Object.keys(decoded.firebase.identities ?? {});
      const providers =
        identities.length > 0
          ? identities
          : [decoded.firebase.sign_in_provider];
      return { uid: decoded.uid, providers };
    } catch {
      throw new AppError(401, 'UNAUTHENTICATED', 'Invalid or expired ID token');
    }
  }
}
