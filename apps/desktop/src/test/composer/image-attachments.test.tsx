import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getImageCardSize } from "@/features/composer/image-attachment-card-size";

describe("image attachments", () => {
  it("keeps direct useEffect calls out of the component files", () => {
    const files = [
      "src/features/composer/image-attachments.tsx",
      "src/features/composer/image-attachment-cards.tsx",
    ];

    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), "utf8");
      expect(source).not.toMatch(/\buseEffect\s*\(/);
      expect(source).not.toMatch(/\buseEffect\b.*from "react"/);
    }
  });
});

describe("getImageCardSize", () => {
  it("scales down to the sent-message card cap while keeping aspect ratio", () => {
    expect(getImageCardSize(800, 600)).toEqual({ width: 160, height: 120 });
  });

  it("does not upscale small images", () => {
    expect(getImageCardSize(120, 80)).toEqual({ width: 120, height: 80 });
  });

  it("returns null when dimensions are unknown", () => {
    expect(getImageCardSize(0, 100)).toBeNull();
    expect(getImageCardSize(100, 0)).toBeNull();
  });

  it("caps composer previews by height so wide screenshots stay short", () => {
    expect(getImageCardSize(1920, 1080, 176, 72)).toEqual({
      height: 72,
      width: 128,
    });
    expect(getImageCardSize(1920, 400, 176, 72)).toEqual({
      height: 37,
      width: 176,
    });
  });
});
