import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const require = createRequire(import.meta.url);
const ENTRY = require.resolve("./mermaid-runtime/entry.mjs");
const OUTPUT = fileURLToPath(
  new URL("../src/markdown/mermaid-runtime.generated.ts", import.meta.url),
);

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "connect-src 'none'",
  "font-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const STRUCTURED_CLONE_FALLBACK =
  'if(typeof globalThis.structuredClone!=="function"){globalThis.structuredClone=function(v){return v===undefined?v:JSON.parse(JSON.stringify(v));};}';

const result = await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["ios15", "chrome100"],
  minify: true,
  legalComments: "none",
  banner: { js: STRUCTURED_CLONE_FALLBACK },
  logLevel: "warning",
});

const script = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1"></head><body><div id="diagram"></div><script>${script}</script></body></html>`;
const nativeRenderer = JSON.parse(
  readFileSync(
    new URL("../node_modules/beautiful-mermaid/package.json", import.meta.url),
    "utf8",
  ),
);
const version = createHash("sha256")
  .update(html)
  .update(`${nativeRenderer.name}@${nativeRenderer.version}`)
  .digest("hex")
  .slice(0, 16);
const output = `export const MERMAID_RUNTIME_VERSION = "${version}";\nexport const MERMAID_RUNTIME_HTML = ${JSON.stringify(html)};\n`;

function current() {
  try {
    return readFileSync(OUTPUT, "utf8");
  } catch {
    return null;
  }
}

if (process.argv.includes("--check")) {
  if (current() !== output) {
    console.error(
      "mermaid-runtime.generated.ts is stale; run pnpm --filter @cocurdex/mobile generate:mermaid-runtime",
    );
    process.exit(1);
  }
} else {
  writeFileSync(OUTPUT, output, "utf8");
}
