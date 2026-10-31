import {
  allowsMermaidNavigation,
  mermaidRenderScript,
  mermaidViewerDocument,
  parseMermaidMessage,
} from "@cocurdex/mobile/internal/markdown/mermaid-document";
import { MERMAID_RUNTIME_HTML } from "@cocurdex/mobile/internal/markdown/mermaid-runtime.generated";
import { describe, expect, it } from "vitest";

function policyDirectives(html: string) {
  const policy = html.match(
    /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/,
  )?.[1];
  return new Map(
    (policy ?? "").split(";").map((part) => {
      const [name = "", ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

describe("mermaid runtime document", () => {
  it("renders offline with a policy that allows no network", () => {
    const directives = policyDirectives(MERMAID_RUNTIME_HTML);
    expect(directives.get("default-src")).toEqual(["'none'"]);
    expect(directives.get("script-src")).toEqual(["'unsafe-inline'"]);
    expect(directives.get("connect-src")).toEqual(["'none'"]);
    expect(directives.get("img-src")).toEqual(["data:", "blob:"]);
    expect(MERMAID_RUNTIME_HTML).not.toMatch(/<script[^>]+src=/);
  });
});

describe("mermaidRenderScript", () => {
  it("passes the diagram source as data that cannot close the script", () => {
    const script = mermaidRenderScript({
      id: "7",
      source: 'graph TD\n  A["</script><b>"] --> B',
      appearance: "dark",
    });
    expect(script).not.toContain("</script>");
    expect(script).toContain("\\u003c/script>\\u003cb>");
    expect(script).toContain('"darkMode":true');
    expect(script).toContain('"id":"7"');
  });
});

describe("allowsMermaidNavigation", () => {
  it("keeps the diagram on its own document", () => {
    expect(allowsMermaidNavigation("about:blank")).toBe(true);
    expect(allowsMermaidNavigation("https://example.invalid/?q=secret")).toBe(
      false,
    );
  });
});

describe("mermaidViewerDocument", () => {
  it("shows the rendered diagram without running any script", () => {
    const html = mermaidViewerDocument("<svg></svg>", "#0a0a0a");
    expect(html).not.toContain("<script");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("script-src");
    expect(html).toContain("user-scalable=yes");
  });
});

describe("parseMermaidMessage", () => {
  it("accepts readiness, rendered diagrams, and errors and ignores anything else", () => {
    expect(parseMermaidMessage('{"type":"ready"}')).toEqual({ type: "ready" });
    expect(
      parseMermaidMessage(
        '{"type":"rendered","id":"1","svg":"<svg/>","width":320,"height":120}',
      ),
    ).toEqual({
      type: "rendered",
      id: "1",
      svg: "<svg/>",
      width: 320,
      height: 120,
      png: null,
    });
    expect(
      parseMermaidMessage(
        '{"type":"rendered","id":"1","svg":"<svg/>","width":320,"height":120,"png":"iVBORw0KGgo="}',
      ),
    ).toMatchObject({ png: "iVBORw0KGgo=" });
    expect(parseMermaidMessage('{"type":"error","id":"2"}')).toEqual({
      type: "error",
      id: "2",
    });
    expect(parseMermaidMessage('{"type":"error"}')).toBeNull();
    expect(
      parseMermaidMessage(
        '{"type":"rendered","id":"1","svg":"<svg/>","width":0,"height":120}',
      ),
    ).toBeNull();
    expect(
      parseMermaidMessage('{"type":"rendered","id":"1","width":1,"height":1}'),
    ).toBeNull();
    expect(parseMermaidMessage("not json")).toBeNull();
  });
});
