import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';
/** 전역 FirebaseAuthGuard를 건너뛴다. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
