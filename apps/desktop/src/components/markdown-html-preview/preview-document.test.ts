import { describe, expect, it } from "vitest";
import { createHtmlPreviewDocument } from "./preview-document";

describe("HTML preview document", () => {
  it("enforces its policy before any generated document content", () => {
    const code = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src *"><style>body { color: red }</style></head><body><script>alert(1)</script></body></html>`;
    const document = new DOMParser().parseFromString(
      createHtmlPreviewDocument(code, true),
      "text/html",
    );
    const policy = document.head.firstElementChild?.getAttribute("content");

    const nonce = document
      .querySelector("script[nonce]")
      ?.getAttribute("nonce");
    expect(nonce).toBeTruthy();
    expect(policy).toContain(`script-src 'nonce-${nonce}'`);
    expect(policy).not.toContain("'unsafe-inline'; style-src");
    expect(policy).toContain("default-src 'none'");
    expect(policy).toContain("base-uri 'none'");
    expect(policy).toContain("form-action 'none'");
    expect(document.querySelector("style")?.textContent).toContain(
      "color: red",
    );
    expect(document.querySelector("script:not([nonce])")?.textContent).toBe(
      "alert(1)",
    );
  });

  it("allows inline scripts on completion without enabling external scripts", () => {
    const document = new DOMParser().parseFromString(
      createHtmlPreviewDocument("<h1>Ready</h1>", false),
      "text/html",
    );
    const policy = document.head.firstElementChild?.getAttribute("content");

    expect(policy).toContain("script-src 'unsafe-inline'");
    expect(policy).toContain("default-src 'none'");
    expect(document.body.textContent).toBe("Ready");
  });
});
