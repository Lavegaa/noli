import { GAME } from '../config/game.config.js';

/** 스토어 상품 ID -> 지급 내용. */
export const PRODUCTS = {
  slots_3: { slots: GAME.storage.slots3ProductBonus },
} as const;

export type ProductId = keyof typeof PRODUCTS;

export const isProductId = (id: string): id is ProductId =>
  Object.hasOwn(PRODUCTS, id);
