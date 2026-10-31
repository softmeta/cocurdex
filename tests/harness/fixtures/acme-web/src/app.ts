export interface Product {
  id: string;
  name: string;
  priceCents: number;
}

export function renderProductList(products: Product[]): string {
  return products
    .map((product) => `${product.name}: ${product.priceCents / 100}`)
    .join("\n");
}
