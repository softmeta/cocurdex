#!/usr/bin/env node
import fs from "node:fs";

const rendererDir = new URL("../out/renderer/", import.meta.url);
const budgetFile = new URL("../startup-budget.json", import.meta.url);
const DETACHED_CHAT_ENTRY = "src/app/layout/chat-window/detached-chat-app.tsx";
const HEADROOM = 1.05;

const manifestFile = new URL(".vite/manifest.json", rendererDir);
if (!fs.existsSync(manifestFile)) {
  console.error("Missing renderer manifest. Run `electron-vite build` first.");
  process.exit(1);
}
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));

const entry = manifest["index.html"];
const roots = [
  "index.html",
  ...(entry.dynamicImports ?? []).filter((key) => key !== DETACHED_CHAT_ENTRY),
];
const chunks = new Set();
const pending = [...roots];
while (pending.length > 0) {
  const key = pending.pop();
  if (chunks.has(key)) continue;
  chunks.add(key);
  pending.push(...(manifest[key].imports ?? []));
}

const files = new Set();
for (const key of chunks) {
  files.add(manifest[key].file);
  for (const css of manifest[key].css ?? []) files.add(css);
}
const sizeOf = (ext) =>
  [...files]
    .filter((file) => file.endsWith(ext))
    .reduce(
      (total, file) => total + fs.statSync(new URL(file, rendererDir)).size,
      0,
    );
const actual = {
  startupJsBytes: sizeOf(".js"),
  startupCssBytes: sizeOf(".css"),
};

if (process.argv.includes("--update")) {
  const next = Object.fromEntries(
    Object.entries(actual).map(([key, bytes]) => [
      key,
      Math.ceil(bytes * HEADROOM),
    ]),
  );
  fs.writeFileSync(budgetFile, `${JSON.stringify(next, null, 2)}\n`);
  console.log("Updated startup budget", next);
  process.exit(0);
}

const budget = JSON.parse(fs.readFileSync(budgetFile, "utf8"));
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
let failed = false;
for (const [key, bytes] of Object.entries(actual)) {
  const limit = budget[key];
  const over = bytes > limit;
  failed ||= over;
  console.log(
    `${over ? "FAIL" : "ok  "} ${key}: ${kb(bytes)} / budget ${kb(limit)}`,
  );
}
console.log(`${chunks.size} startup chunks`);
if (failed) {
  console.error(
    "Startup bundle exceeds its budget. Move the new dependency behind lazyComponent or a feature subentry; if the growth is intended, run `pnpm --filter @cocurdex/desktop check:startup-bundle --update` and explain it in the PR.",
  );
  process.exit(1);
}
