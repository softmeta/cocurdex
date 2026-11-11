import { createHash } from "node:crypto";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const INLINE_SCRIPT = /<script>([\s\S]*?)<\/script>/g;
const DEFAULT_RENDERER = fileURLToPath(
  new URL("../../desktop/out/renderer", import.meta.url),
);

// Browsers hash an inline script after normalizing its newlines
// (https://w3c.github.io/webappsec-csp/#match-element-to-source-list).
function scriptDigest(text) {
  const parsed = text.replace(/\r\n?/g, "\n");
  return `'sha256-${createHash("sha256").update(parsed).digest("base64")}'`;
}

// frame-ancestors, sandbox, and report-uri are ignored in a <meta> policy,
// so the host sends frame-ancestors as a header.
export function contentSecurityPolicy(index, connectSources) {
  const scripts = ["'self'", "'wasm-unsafe-eval'"];
  for (const match of index.matchAll(INLINE_SCRIPT)) {
    scripts.push(scriptDigest(match[1]));
  }
  return [
    "default-src 'self'",
    `script-src ${scripts.join(" ")}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src ${["'self'", ...connectSources].join(" ")}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

function withPolicy(index, policy) {
  const head = index.indexOf("<head>");
  if (head < 0) throw new Error("index.html has no <head>");
  const at = head + "<head>".length;
  const meta = `\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`;
  return index.slice(0, at) + meta + index.slice(at);
}

export async function packageWeb({ renderer, out, connectSources }) {
  const index = await readFile(path.join(renderer, "index.html"), "utf8");
  await rm(out, { recursive: true, force: true });
  await mkdir(path.dirname(out), { recursive: true });
  await cp(renderer, out, { recursive: true });
  const policy = contentSecurityPolicy(index, connectSources);
  await writeFile(path.join(out, "index.html"), withPolicy(index, policy));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      renderer: { type: "string", default: DEFAULT_RENDERER },
      out: { type: "string" },
      "connect-src": { type: "string", multiple: true, default: ["wss:"] },
    },
  });
  if (!values.out) throw new Error("--out <directory> is required");
  await packageWeb({
    renderer: path.resolve(values.renderer),
    out: path.resolve(values.out),
    connectSources: values["connect-src"],
  });
}
