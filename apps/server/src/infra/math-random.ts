import { Injectable } from '@nestjs/common';
import type { Random } from '../common/ports.js';

@Injectable()
export class MathRandom implements Random {
  next(): number {
    return Math.random();
  }
}
