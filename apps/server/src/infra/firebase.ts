import { getApps, initializeApp, type App } from 'firebase-admin/app';

/** ADC(GOOGLE_APPLICATION_CREDENTIALS) 기준으로 한 번만 초기화한다. */
export function firebaseApp(): App {
  return (
    getApps()[0] ??
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID })
  );
}
