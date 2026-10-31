import {
  httpUrlSchema,
  loopbackHttpUrlSchema,
  schemas,
} from "@desktop/electron/ipc/ipc-schemas";
import { describe, expect, it } from "vitest";

describe("httpUrlSchema", () => {
  it("accepts http and https URLs", () => {
    expect(httpUrlSchema.safeParse("http://localhost:3000/").success).toBe(
      true,
    );
    expect(httpUrlSchema.safeParse("https://example.com/a?b=c").success).toBe(
      true,
    );
  });

  it("rejects file:// URLs so IPC cannot open or load local files", () => {
    expect(httpUrlSchema.safeParse("file:///etc/passwd").success).toBe(false);
    expect(
      httpUrlSchema.safeParse("file:///C:/Windows/System32/calc.exe").success,
    ).toBe(false);
  });

  it("rejects other dangerous schemes", () => {
    expect(httpUrlSchema.safeParse("javascript:alert(1)").success).toBe(false);
    expect(httpUrlSchema.safeParse("chrome://settings").success).toBe(false);
    expect(httpUrlSchema.safeParse("smb://host/share").success).toBe(false);
  });
});

describe("loopbackHttpUrlSchema", () => {
  it("accepts plain http URLs on loopback hosts", () => {
    for (const url of [
      "http://127.0.0.1:4100/decks/download?ticket=a",
      "http://localhost:4100/decks/download",
      "http://[::1]:4100/decks/download",
    ]) {
      expect(loopbackHttpUrlSchema.safeParse(url).success).toBe(true);
    }
  });

  it("rejects remote hosts and lookalike hostnames", () => {
    for (const url of [
      "https://example.com/decks/download",
      "http://127.0.0.1.example.com/decks/download",
      "http://localhost@example.com/decks/download",
      "file:///etc/passwd",
    ]) {
      expect(loopbackHttpUrlSchema.safeParse(url).success).toBe(false);
    }
  });
});

describe("schemas.browserAnnotation", () => {
  const validAnnotation = {
    id: "annotation-1",
    type: "element",
    selector: "main > button.submit",
    tagName: "BUTTON",
    textContent: "Submit",
    boundingBox: { x: 10, y: 20, width: 100, height: 32 },
    pageUrl: "https://example.com/form",
    note: "This button overflows",
    capturedAt: "2026-07-02T10:00:00.000Z",
  };

  it("accepts a well-formed annotation", () => {
    expect(schemas.browserAnnotation.safeParse(validAnnotation).success).toBe(
      true,
    );
  });

  it("accepts a region annotation with a screenshot data URL", () => {
    const region = {
      id: "annotation-2",
      type: "region",
      boundingBox: { x: 0, y: 0, width: 400, height: 300 },
      regionScreenshot: "data:image/png;base64,iVBORw0KGgo=",
      pageUrl: "https://example.com/",
      capturedAt: "2026-07-02T10:00:00.000Z",
    };
    expect(schemas.browserAnnotation.safeParse(region).success).toBe(true);
  });

  it("rejects unknown extra keys injected by a hostile page", () => {
    const parsed = schemas.browserAnnotation.safeParse({
      ...validAnnotation,
      __proto__pollution: "x",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects non-finite bounding box values", () => {
    const parsed = schemas.browserAnnotation.safeParse({
      ...validAnnotation,
      boundingBox: { x: Number.NaN, y: 0, width: 1, height: 1 },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a screenshot that is not an image data URL", () => {
    const parsed = schemas.browserAnnotation.safeParse({
      ...validAnnotation,
      regionScreenshot: "https://evil.example/x.png",
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects oversized text fields", () => {
    const parsed = schemas.browserAnnotation.safeParse({
      ...validAnnotation,
      textContent: "a".repeat(20_001),
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown annotation type", () => {
    const parsed = schemas.browserAnnotation.safeParse({
      ...validAnnotation,
      type: "script",
    });
    expect(parsed.success).toBe(false);
  });
});

describe("schemas.audienceWindow", () => {
  it("accepts a random channel id", () => {
    expect(
      schemas.audienceWindow.safeParse({ channel: crypto.randomUUID() })
        .success,
    ).toBe(true);
  });

  it("rejects channel values that could alter the audience URL", () => {
    for (const channel of ["", "a&window=chat", "../index", "x".repeat(65)]) {
      expect(schemas.audienceWindow.safeParse({ channel }).success).toBe(false);
    }
  });
});
