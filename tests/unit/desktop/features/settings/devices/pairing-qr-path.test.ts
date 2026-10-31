import { buildHostPairingLink, parseHostPairingLink } from "@cocurdex/shared";
import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { pairingQrShape } from "@/features/settings/devices/pairing-qr-path";

const PIXELS_PER_MODULE = 4;

function rasterize(text: string) {
  const { size, path } = pairingQrShape(text);
  const dark = new Set(
    [...path.matchAll(/M(\d+) (\d+)/g)].map(([, x, y]) => `${x},${y}`),
  );
  const width = size * PIXELS_PER_MODULE;
  const pixels = new Uint8ClampedArray(width * width * 4);
  for (let py = 0; py < width; py += 1) {
    for (let px = 0; px < width; px += 1) {
      const module = `${Math.floor(px / PIXELS_PER_MODULE)},${Math.floor(py / PIXELS_PER_MODULE)}`;
      const value = dark.has(module) ? 0 : 255;
      pixels.set([value, value, value, 255], (py * width + px) * 4);
    }
  }
  return { pixels, width };
}

describe("pairing QR code", () => {
  it.each([
    "http://192.168.1.20:47820",
    "http://my-mac.tailnet-1234.ts.net:47820",
  ])("decodes to a pairing link the mobile app accepts (%s)", (origin) => {
    const link = buildHostPairingLink(origin, "K7Q2-9XZD", "A".repeat(43));
    const { pixels, width } = rasterize(link);
    const decoded = jsQR(pixels, width, width)?.data;
    expect(decoded).toBe(link);
    expect(parseHostPairingLink(decoded ?? "")).toEqual(
      parseHostPairingLink(link),
    );
  });
});
