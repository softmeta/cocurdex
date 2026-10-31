import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { readImageInfo } from "@cocurdex/deck/image-info";
import { describe, expect, it } from "vitest";

const fixturesDir = path.dirname(
  createRequire(import.meta.url).resolve("./fixtures/swatch-3x2.png"),
);
const fixture = (name: string) => readFileSync(path.join(fixturesDir, name));

describe("readImageInfo", () => {
  it("reads PNG dimensions from the header", () => {
    expect(readImageInfo(fixture("swatch-3x2.png"))).toEqual({
      mimeType: "image/png",
      width: 3,
      height: 2,
    });
  });

  it("reads JPEG dimensions past APP segments", () => {
    expect(readImageInfo(fixture("photo-40x50.jpg"))).toEqual({
      mimeType: "image/jpeg",
      width: 40,
      height: 50,
    });
  });

  it("rejects other formats and truncated data", () => {
    const gif = Buffer.from("GIF89a\u0001\u0000\u0001\u0000", "latin1");
    expect(readImageInfo(gif)).toBeNull();
    expect(readImageInfo(fixture("swatch-3x2.png").subarray(0, 20))).toBeNull();
    expect(
      readImageInfo(fixture("photo-40x50.jpg").subarray(0, 30)),
    ).toBeNull();
    expect(readImageInfo(Buffer.alloc(0))).toBeNull();
  });
});
