import type { ImageAttachment } from "@cocurdex/shared";
import { describe, expect, it } from "vitest";
import {
  imagePreviewNeighbor,
  resolveImagePreviewGallery,
} from "./image-preview-gallery";

function image(id: string): ImageAttachment {
  return {
    filePath: `/tmp/${id}.png`,
    height: 10,
    id,
    kind: "image",
    mimeType: "image/png",
    name: `${id}.png`,
    sizeBytes: 1,
    width: 10,
  };
}

const a = image("a");
const b = image("b");
const c = image("c");

describe("resolveImagePreviewGallery", () => {
  it("treats a missing gallery as a single image", () => {
    expect(resolveImagePreviewGallery(a, [])).toEqual({
      canNavigate: false,
      index: 0,
      next: null,
      previous: null,
      total: 1,
    });
  });

  it("treats an attachment outside the gallery as a single image", () => {
    expect(resolveImagePreviewGallery(a, [b, c])).toEqual({
      canNavigate: false,
      index: 0,
      next: null,
      previous: null,
      total: 1,
    });
  });

  it("does not navigate a one-image gallery", () => {
    expect(resolveImagePreviewGallery(a, [a])).toEqual({
      canNavigate: false,
      index: 0,
      next: null,
      previous: null,
      total: 1,
    });
  });

  it("exposes neighbors without wrapping", () => {
    expect(resolveImagePreviewGallery(a, [a, b, c])).toEqual({
      canNavigate: true,
      index: 0,
      next: b,
      previous: null,
      total: 3,
    });
    expect(resolveImagePreviewGallery(b, [a, b, c])).toEqual({
      canNavigate: true,
      index: 1,
      next: c,
      previous: a,
      total: 3,
    });
    expect(resolveImagePreviewGallery(c, [a, b, c])).toEqual({
      canNavigate: true,
      index: 2,
      next: null,
      previous: b,
      total: 3,
    });
  });
});

describe("imagePreviewNeighbor", () => {
  it("maps arrow keys to list order in LTR", () => {
    expect(imagePreviewNeighbor("ArrowLeft", false)).toBe("previous");
    expect(imagePreviewNeighbor("ArrowRight", false)).toBe("next");
  });

  it("flips arrow keys in RTL", () => {
    expect(imagePreviewNeighbor("ArrowLeft", true)).toBe("next");
    expect(imagePreviewNeighbor("ArrowRight", true)).toBe("previous");
  });

  it("ignores unrelated keys", () => {
    expect(imagePreviewNeighbor("Escape", false)).toBeNull();
    expect(imagePreviewNeighbor("ArrowUp", true)).toBeNull();
  });
});
