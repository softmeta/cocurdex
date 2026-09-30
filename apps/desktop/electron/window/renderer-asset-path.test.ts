import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRendererAssetPath } from "./renderer-asset-path";

const root = path.resolve("/app/out/renderer");

describe("resolveRendererAssetPath", () => {
  it("maps renderer URLs to files under the renderer root", () => {
    expect(
      resolveRendererAssetPath(root, "app://renderer/assets/index-abc.js"),
    ).toBe(path.join(root, "assets", "index-abc.js"));
  });

  it("serves index.html for the root path and ignores the query", () => {
    expect(resolveRendererAssetPath(root, "app://renderer/?window=chat")).toBe(
      path.join(root, "index.html"),
    );
  });

  it("decodes percent-encoded path segments", () => {
    expect(
      resolveRendererAssetPath(root, "app://renderer/cmaps/UniJIS%20H.bcmap"),
    ).toBe(path.join(root, "cmaps", "UniJIS H.bcmap"));
  });

  it("keeps normalized dot segments inside the renderer root", () => {
    expect(
      resolveRendererAssetPath(root, "app://renderer/%2E%2E/main/main.js"),
    ).toBe(path.join(root, "main", "main.js"));
  });

  it("rejects encoded separators that could escape the renderer root", () => {
    expect(
      resolveRendererAssetPath(root, "app://renderer/..%2F..%2Fsecret"),
    ).toBeNull();
    expect(
      resolveRendererAssetPath(root, "app://renderer/%2Fetc%2Fpasswd"),
    ).toBeNull();
  });

  it("rejects other hosts and schemes", () => {
    expect(resolveRendererAssetPath(root, "app://other/index.html")).toBeNull();
    expect(resolveRendererAssetPath(root, "file:///index.html")).toBeNull();
  });
});
