export interface LineItem {
  sku: string;
  unitPrice: number;
  quantity: number;
}

export function cartSubtotal(items: LineItem[]): number {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}
