export interface DiscountCode {
  code: string;
  amountOff: number;
}

export function applyDiscount(
  subtotal: number,
  discount: DiscountCode,
): number {
  return Math.max(0, subtotal - discount.amountOff);
}
