import { vi } from 'vitest';
import { AppError } from '../common/app-error.js';
import { FirebaseAuthVerifier } from './firebase-auth-verifier.js';

const verifyIdToken = vi.fn();
vi.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken }),
}));
vi.mock('./firebase.js', () => ({ firebaseApp: () => ({}) }));

describe('FirebaseAuthVerifier', () => {
  it('invalid token -> 401 UNAUTHENTICATED (same code as a missing header)', async () => {
    verifyIdToken.mockRejectedValueOnce(new Error('expired'));
    const error = await new FirebaseAuthVerifier()
      .verify('bad')
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect((error as AppError).getStatus()).toBe(401);
    expect((error as AppError).code).toBe('UNAUTHENTICATED');
  });

  it('valid token -> uid and linked identities', async () => {
    verifyIdToken.mockResolvedValueOnce({
      uid: 'u1',
      firebase: {
        identities: { 'google.com': ['x'] },
        sign_in_provider: 'google.com',
      },
    });
    await expect(new FirebaseAuthVerifier().verify('ok')).resolves.toEqual({
      uid: 'u1',
      providers: ['google.com'],
    });
  });
});
