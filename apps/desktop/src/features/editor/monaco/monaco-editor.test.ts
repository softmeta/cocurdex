import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("MonacoEditor component effects", () => {
  it("keeps direct useEffect calls out of the component file", () => {
    const source = readFileSync(
      join(process.cwd(), "src/features/editor/monaco/monaco-editor.tsx"),
      "utf8",
    );

    expect(source).not.toMatch(/\buseEffect\s*\(/);
    expect(source).not.toMatch(/\buseEffect\b.*from "react"/);
  });
});
