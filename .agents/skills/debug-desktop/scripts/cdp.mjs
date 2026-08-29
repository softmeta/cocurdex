#!/usr/bin/env node
// Zero-dependency Chrome DevTools Protocol helper for the Cocurdex desktop app.
// Uses Node built-in fetch + WebSocket (Node 22+), so it runs from anywhere with
// no node_modules — no Playwright, no pnpm workspace resolution gotchas.
//
// Usage (app must be started with `pnpm --filter @cocurdex/desktop dev:inspect`):
//   node cdp.mjs targets            list CDP targets
//   node cdp.mjs eval "<jsExpr>"    evaluate JS in the renderer, print result
//   node cdp.mjs shot [outPath]     screenshot renderer -> /tmp/cocurdex.png
//
// Origin gotcha: main.ts sets remote-allow-origins=http://127.0.0.1:9222, so the
// endpoint MUST be 127.0.0.1, never localhost.

import { writeFileSync } from "node:fs";

const PORT = process.env.COCURDEX_REMOTE_DEBUGGING_PORT ?? "9222";
const BASE = `http://127.0.0.1:${PORT}`;

async function pickPageTarget() {
  let targets;
  try {
    targets = await (await fetch(`${BASE}/json/list`)).json();
  } catch {
    throw new Error(
      `No CDP at ${BASE}. Start the app with \`pnpm --filter @cocurdex/desktop dev:inspect\`.`,
    );
  }
  const page = targets.find(
    (t) =>
      t.type === "page" &&
      t.webSocketDebuggerUrl &&
      !t.url.startsWith("devtools://"),
  );
  if (!page) throw new Error("No renderer page target found.");
  return page;
}

// Open a websocket to the page target and expose a promise-based CDP `send`.
async function connect(page) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const pending = new Map();
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  await new Promise((r, j) => {
    ws.addEventListener("open", r);
    ws.addEventListener("error", j);
  });
  const send = (method, params = {}) =>
    new Promise((r) => {
      const i = id++;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return { ws, send };
}

const [cmd, arg] = process.argv.slice(2);

if (cmd === "targets") {
  const targets = await (await fetch(`${BASE}/json/list`)).json();
  for (const t of targets) {
    console.log(`${t.type}\t${t.title?.slice(0, 40)}\t${t.url?.slice(0, 60)}`);
  }
} else if (cmd === "eval") {
  if (!arg) throw new Error('Usage: node cdp.mjs eval "<jsExpr>"');
  const page = await pickPageTarget();
  const { ws, send } = await connect(page);
  const res = await send("Runtime.evaluate", {
    expression: arg,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.result?.exceptionDetails) {
    console.error("Eval error:", res.result.exceptionDetails.text);
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify(res.result?.result?.value, null, 2));
  }
  ws.close();
} else if (cmd === "shot") {
  const out = arg ?? "/tmp/cocurdex.png";
  const page = await pickPageTarget();
  const { ws, send } = await connect(page);
  const res = await send("Page.captureScreenshot", { format: "png" });
  if (!res.result?.data) throw new Error("Screenshot failed (no data).");
  writeFileSync(out, Buffer.from(res.result.data, "base64"));
  console.log(`Screenshot -> ${out}`);
  ws.close();
} else {
  console.log("Usage: node cdp.mjs <targets|eval \"<expr>\"|shot [outPath]>");
  process.exitCode = 1;
}
