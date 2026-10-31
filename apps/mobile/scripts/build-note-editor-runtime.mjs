import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import esbuild from "esbuild";

const ENTRY = fileURLToPath(
  new URL("./note-editor-runtime/entry.ts", import.meta.url),
);
const OUTPUT = fileURLToPath(
  new URL(
    "../src/notes/editor/note-editor-runtime.generated.ts",
    import.meta.url,
  ),
);

const CONTENT_SECURITY_POLICY = [
  "default-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src 'none'",
  "connect-src 'none'",
  "font-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

const STYLE = `
:root{color-scheme:light dark;--font-size:17px}
html,body{margin:0;padding:0;background:var(--background);color:var(--foreground);-webkit-text-size-adjust:100%}
body{font-family:-apple-system,system-ui,Roboto,"PingFang SC","Noto Sans CJK SC",sans-serif;font-size:var(--font-size);line-height:1.53;-webkit-tap-highlight-color:transparent}
main{padding:4px 16px 120px}
#title{display:block;width:100%;box-sizing:border-box;border:0;outline:0;resize:none;overflow:hidden;padding:0;margin:0;background:transparent;color:inherit;font:inherit;font-size:calc(var(--font-size)*1.65);line-height:1.22;font-weight:700}
#title::placeholder{color:var(--muted-foreground)}
#meta{display:block;border:0;background:transparent;padding:6px 0 4px;margin:0 0 4px;font:inherit;font-size:calc(var(--font-size)*0.765);line-height:1.4;color:var(--muted-foreground);text-align:left;min-height:32px}
#meta[hidden]{display:none}
.prose{outline:0;min-height:50vh;caret-color:var(--tint);word-wrap:break-word;white-space:pre-wrap}
.prose>*:first-child{margin-top:6px}
.prose p{margin:0 0 10px}
.prose h1{font-size:1.41em;line-height:1.25;font-weight:700;margin:22px 0 8px}
.prose h2{font-size:1.18em;line-height:1.3;font-weight:600;margin:20px 0 6px}
.prose h3{font-size:1em;line-height:1.4;font-weight:600;margin:16px 0 4px}
.prose ul,.prose ol{margin:0 0 10px;padding-left:22px}
.prose li>p{margin:0 0 4px}
.prose a{color:var(--tint);text-decoration:underline;text-underline-offset:3px}
.prose blockquote{margin:0 0 10px;padding-left:12px;border-left:3px solid var(--border);color:var(--muted-foreground)}
.prose code{font-family:ui-monospace,Menlo,monospace;font-size:0.85em;background:var(--muted);border-radius:4px;padding:1px 4px}
.prose pre{background:var(--muted);border-radius:12px;padding:10px 12px;margin:0 0 10px;overflow-x:auto}
.ProseMirror.prose pre,.ProseMirror.prose pre code{white-space:pre;word-wrap:normal;overflow-wrap:normal}
.prose pre code{background:transparent;padding:0;font-size:0.8em;line-height:1.45}
.prose hr{border:0;border-top:1px solid var(--border);margin:16px 0}
.prose table{border-collapse:collapse;margin:0 0 10px;display:block;overflow-x:auto}
.prose th,.prose td{border:1px solid var(--border);padding:6px 8px;min-width:64px;vertical-align:top}
.prose th{font-weight:600;text-align:left}
.prose ul[data-type=taskList]{list-style:none;padding-left:0}
.prose ul[data-type=taskList] li{display:flex;align-items:flex-start;gap:10px}
.prose ul[data-type=taskList] li>label{flex-shrink:0;display:flex;align-items:center;height:1.53em}
.prose ul[data-type=taskList] li>label input{appearance:none;-webkit-appearance:none;width:20px;height:20px;margin:0;border-radius:10px;border:1.5px solid var(--muted-foreground);display:grid;place-content:center}
.prose ul[data-type=taskList] li>label input:checked{background:var(--brand-mark);border-color:var(--brand-mark)}
.prose ul[data-type=taskList] li>label input:checked::after{content:"";width:5px;height:10px;border:solid var(--background);border-width:0 2px 2px 0;transform:translateY(-1px) rotate(45deg)}
.prose ul[data-type=taskList] li>div{flex:1;min-width:0}
.prose ul[data-type=taskList] li[data-checked=true]>div{color:var(--muted-foreground);text-decoration:line-through}
.prose p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:var(--muted-foreground);float:left;height:0;pointer-events:none}
.doc-image{display:inline-flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid var(--border);border-radius:10px;background:var(--muted);color:var(--foreground);font:inherit;font-size:0.85em}
.ProseMirror-selectednode{outline:2px solid var(--tint);outline-offset:2px}
`;

const result = await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["ios15", "chrome100"],
  minify: true,
  legalComments: "none",
  logLevel: "warning",
});

const script = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const style = STYLE.replace(/\n/g, "");
const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,viewport-fit=cover"><style>${style}</style></head><body><main><textarea id="title" rows="1" enterkeyhint="next"></textarea><button id="meta" type="button"></button><div id="body"></div></main><script>${script}</script></body></html>`;
const version = createHash("sha256").update(html).digest("hex").slice(0, 16);
const output = `export const NOTE_EDITOR_RUNTIME_VERSION = "${version}";\nexport const NOTE_EDITOR_RUNTIME_HTML = ${JSON.stringify(html)};\n`;

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
      "note-editor-runtime.generated.ts is stale; run pnpm --filter @cocurdex/mobile generate:note-editor-runtime",
    );
    process.exit(1);
  }
} else {
  writeFileSync(OUTPUT, output, "utf8");
}
