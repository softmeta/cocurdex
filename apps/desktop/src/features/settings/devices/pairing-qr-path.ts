import { encode } from "uqr";

export interface PairingQrShape {
  size: number;
  path: string;
}

export function pairingQrShape(text: string): PairingQrShape {
  const { data, size } = encode(text, { ecc: "M", border: 2 });
  const segments: string[] = [];
  data.forEach((row, y) => {
    row.forEach((dark, x) => {
      if (dark) segments.push(`M${x} ${y}h1v1h-1z`);
    });
  });
  return { size, path: segments.join("") };
}
