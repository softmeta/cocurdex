import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPdfAssetUrl,
  parsePdfAssetUrl,
  resolvePdfReadPath,
} from "./pdf-read-service";

const WORKSPACE_ROOT = path.resolve("/workspace/project");
const OTHER_ROOT = path.resolve("/workspace/other");
const ROOTS = [WORKSPACE_ROOT, OTHER_ROOT];

describe("resolvePdfReadPath", () => {
  it("allows a .pdf inside a registered workspace", () => {
    const target = path.join(WORKSPACE_ROOT, "docs", "guide.pdf");
    expect(resolvePdfReadPath(target, ROOTS)).toBe(target);
  });

  it("allows a .pdf inside any of the registered workspaces", () => {
    const target = path.join(OTHER_ROOT, "spec.pdf");
    expect(resolvePdfReadPath(target, ROOTS)).toBe(target);
  });

  it("is case-insensitive on the extension", () => {
    const target = path.join(WORKSPACE_ROOT, "REPORT.PDF");
    expect(resolvePdfReadPath(target, ROOTS)).toBe(target);
  });

  it("rejects a path outside every workspace", () => {
    const target = path.resolve("/etc/secret.pdf");
    expect(() => resolvePdfReadPath(target, ROOTS)).toThrow(
      /outside every registered workspace/,
    );
  });

  it("rejects everything when no workspace is registered", () => {
    const target = path.join(WORKSPACE_ROOT, "guide.pdf");
    expect(() => resolvePdfReadPath(target, [])).toThrow(
      /outside every registered workspace/,
    );
  });

  it("rejects a traversal escape that resolves outside the workspace", () => {
    const target = path.join(WORKSPACE_ROOT, "..", "elsewhere", "x.pdf");
    expect(() => resolvePdfReadPath(target, ROOTS)).toThrow(
      /outside every registered workspace/,
    );
  });

  it("rejects a sibling directory sharing the root as a prefix", () => {
    const target = `${WORKSPACE_ROOT}-evil${path.sep}x.pdf`;
    expect(() => resolvePdfReadPath(target, ROOTS)).toThrow(
      /outside every registered workspace/,
    );
  });

  it("rejects a non-PDF file", () => {
    const target = path.join(WORKSPACE_ROOT, "notes.txt");
    expect(() => resolvePdfReadPath(target, ROOTS)).toThrow(/not a PDF/);
  });
});

describe("buildPdfAssetUrl / parsePdfAssetUrl", () => {
  it("round-trips a simple path", () => {
    const url = buildPdfAssetUrl("/workspace/doc.pdf");
    expect(parsePdfAssetUrl(url)).toBe("/workspace/doc.pdf");
  });

  it("round-trips paths with special characters", () => {
    const filePath = "/workspace/文档/报告 2024.pdf";
    const url = buildPdfAssetUrl(filePath);
    expect(parsePdfAssetUrl(url)).toBe(filePath);
  });

  it("throws on a URL missing the file parameter", () => {
    expect(() => parsePdfAssetUrl("pdf-asset://workspace")).toThrow(
      /missing file/,
    );
  });
});
