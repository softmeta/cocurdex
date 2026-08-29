import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPdfAssetUrl,
  parsePdfAssetUrl,
  resolvePdfReadPath,
} from "./pdf-read-service";

const WORKSPACE_ROOT = path.resolve("/workspace/project");
const ROOTS = [WORKSPACE_ROOT];

// The pdf-asset URL carries only the file path; the workspace scope comes from
// main-process state. These tests assert that a crafted URL cannot widen the
// authorization boundary.
describe("pdf-asset protocol URL security", () => {
  it("rejects a traversal attack embedded in the URL", () => {
    const malicious = path.resolve("/etc/passwd");
    const url = buildPdfAssetUrl(malicious);
    expect(() => resolvePdfReadPath(parsePdfAssetUrl(url), ROOTS)).toThrow(
      /outside every registered workspace/,
    );
  });

  it("ignores a root smuggled into the URL query", () => {
    const malicious = path.resolve("/etc/secret.pdf");
    const url = `${buildPdfAssetUrl(malicious)}&root=${encodeURIComponent("/")}`;
    expect(() => resolvePdfReadPath(parsePdfAssetUrl(url), ROOTS)).toThrow(
      /outside every registered workspace/,
    );
  });

  it("rejects a non-PDF extension in the URL", () => {
    const filePath = path.join(WORKSPACE_ROOT, "script.sh");
    const url = buildPdfAssetUrl(filePath);
    expect(() => resolvePdfReadPath(parsePdfAssetUrl(url), ROOTS)).toThrow(
      /not a PDF/,
    );
  });

  it("accepts a valid workspace PDF through the URL round-trip", () => {
    const filePath = path.join(WORKSPACE_ROOT, "docs", "guide.pdf");
    const url = buildPdfAssetUrl(filePath);
    expect(resolvePdfReadPath(parsePdfAssetUrl(url), ROOTS)).toBe(filePath);
  });
});
