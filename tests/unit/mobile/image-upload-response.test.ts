import {
  ImageUploadError,
  parseImageUploadResponse,
} from "@cocurdex/mobile/internal/session-detail/image-upload-response";
import { describe, expect, it } from "vitest";

const stored = {
  kind: "image",
  id: "img-1",
  name: "a.png",
  mimeType: "image/png",
  sizeBytes: 12,
  filePath: "/data/image-attachments/img-1.png",
  width: 4,
  height: 5,
};

function failureOf(status: number, body: string) {
  try {
    parseImageUploadResponse(status, body);
  } catch (error) {
    return error instanceof ImageUploadError ? error.reason : "thrown";
  }
  return null;
}

describe("parseImageUploadResponse", () => {
  it("returns the stored attachment the daemon created", () => {
    expect(parseImageUploadResponse(201, JSON.stringify(stored))).toEqual(
      stored,
    );
  });

  it("maps daemon refusals to the reason the composer shows", () => {
    expect(failureOf(413, "")).toBe("tooLarge");
    expect(failureOf(415, "")).toBe("unsupported");
    expect(failureOf(403, "")).toBe("failed");
    expect(failureOf(201, JSON.stringify({ kind: "document" }))).toBe("failed");
  });
});
