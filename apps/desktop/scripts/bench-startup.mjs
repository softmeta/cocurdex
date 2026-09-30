#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const appDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index === -1 ? fallback : args[index + 1];
};
const runs = Number(option("--runs", "8"));
const port = Number(option("--port", "9555"));
const onboarding = args.includes("--onboarding");

if (!fs.existsSync(path.join(appDir, "out", "renderer", "index.html"))) {
  console.error("Missing build output. Run `electron-vite build` first.");
  process.exit(1);
}

const userData = fs.mkdtempSync(path.join(os.tmpdir(), "cx-bench-"));
const child = spawn(require("electron"), ["."], {
  cwd: appDir,
  env: {
    ...process.env,
    COCURDEX_REMOTE_DEBUGGING_PORT: String(port),
    COCURDEX_USER_DATA_PATH: userData,
  },
  stdio: "ignore",
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connect() {
  let target;
  for (let attempt = 0; attempt < 150 && !target; attempt += 1) {
    await sleep(200);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      target = (await response.json()).find(
        (item) => item.type === "page" && item.url.includes("index.html"),
      );
    } catch {}
  }
  if (!target) throw new Error("Renderer page did not appear");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => {
    socket.onopen = resolve;
  });
  let nextId = 0;
  const pending = new Map();
  socket.onmessage = (message) => {
    const data = JSON.parse(message.data);
    pending.get(data.id)?.(data);
    pending.delete(data.id);
  };
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      nextId += 1;
      pending.set(nextId, resolve);
      socket.send(JSON.stringify({ id: nextId, method, params }));
    });
  const evaluate = async (expression) =>
    (
      await send("Runtime.evaluate", {
        awaitPromise: true,
        expression,
        returnByValue: true,
      })
    ).result?.result?.value;
  return { evaluate, send, socket };
}

const PROBE = `new Promise((resolve) => {
  let lcp = 0;
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) lcp = Math.max(lcp, entry.startTime);
  }).observe({ type: "largest-contentful-paint", buffered: true });
  setTimeout(() => {
    const fcp = performance.getEntriesByType("paint")
      .find((entry) => entry.name === "first-contentful-paint");
    resolve({ fcp: Math.round(fcp?.startTime ?? 0), lcp: Math.round(lcp) });
  }, 300);
})`;
const WARMUP_RELOADS = 3;
const samples = [];

try {
  await sleep(5000);
  for (let index = 0; index < runs + WARMUP_RELOADS; index += 1) {
    const page = await connect();
    if (index === 0 && !onboarding) {
      await page.evaluate(
        'localStorage.setItem("cocurdex.onboarding-hidden", "true")',
      );
    }
    if (index >= WARMUP_RELOADS) samples.push(await page.evaluate(PROBE));
    page.send("Page.reload");
    await sleep(200);
    page.socket.close();
    await sleep(2800);
  }
} finally {
  child.kill();
  await sleep(1500);
  fs.rmSync(userData, { force: true, recursive: true });
}

const median = (key) => {
  const values = samples.map((sample) => sample[key]).sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)];
};
console.log(
  JSON.stringify(
    {
      scenario: onboarding ? "onboarding" : "returning-user",
      runs: samples.length,
      medianFcpMs: median("fcp"),
      medianLcpMs: median("lcp"),
    },
    null,
    2,
  ),
);
process.exit(0);
