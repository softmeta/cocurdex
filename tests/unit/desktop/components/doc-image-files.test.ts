import { describe, expect, it } from "vitest";
import {
  docImageAlt,
  docImageRejection,
  imageFilesOf,
  MAX_DOC_IMAGE_BYTES,
} from "@/components/markdown-body-editor/image/doc-image-files";

const file = (name: string, type: string, size = 100) => ({ name, type, size });

describe("doc image files", () => {
  it("takes only image files from a paste or drop", () => {
    const png = file("shot.png", "image/png");
    const svg = file("logo.svg", "image/svg+xml");
    expect(imageFilesOf([png, file("notes.txt", "text/plain"), svg])).toEqual([
      png,
      svg,
    ]);
    expect(imageFilesOf(null)).toEqual([]);
  });

  it("rejects formats the daemon cannot store and oversized files", () => {
    expect(docImageRejection(file("a.png", "image/png"))).toBeNull();
    expect(docImageRejection(file("a.svg", "image/svg+xml"))).toBe(
      "unsupported",
    );
    expect(
      docImageRejection(file("a.png", "image/png", MAX_DOC_IMAGE_BYTES + 1)),
    ).toBe("tooLarge");
  });

  it("derives alt text that cannot break the markdown image syntax", () => {
    expect(docImageAlt("Checkout [v2]  flow.png")).toBe("Checkout v2 flow");
    expect(docImageAlt("image.png")).toBe("image");
  });
});
