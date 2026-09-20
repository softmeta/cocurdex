#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import {
  connect,
  evaluate,
  readEndpoint,
  selectTarget,
  waitFor,
} from "./cdp-client.mjs";
import { preflight } from "./cdp-preflight.mjs";

const REPO_ROOT = fileURLToPath(new URL("../../../../", import.meta.url)).replace(
  /[\\/]$/,
  "",
);
const DESKTOP_DIR = path.join(REPO_ROOT, "apps", "desktop");
const MAIN_BUNDLE = path.join(DESKTOP_DIR, "out", "main", "main.js");
const INSTANCE_RECORD = "debug-instance.json";
const PORT_SCAN_START = 9222;
const PORT_SCAN_END = 9231;

function numberOption(value, name, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max)
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return number;
}

function probePort(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(300);
    socket.once("connect", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(true));
  });
}

async function findFreePort(requested) {
  if (requested) {
    if (!(await probePort(requested)))
      throw new Error(`Port ${requested} is already listening`);
    return requested;
  }
  for (let port = PORT_SCAN_START; port <= PORT_SCAN_END; port += 1) {
    if (await probePort(port)) return port;
  }
  throw new Error(
    `No free CDP port in ${PORT_SCAN_START}-${PORT_SCAN_END}; pass --port`,
  );
}

async function probeHttp(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
    return response.ok;
  } catch {
    return false;
  }
}

async function discoverRendererUrl(options) {
  if (options.rendererUrl) return options.rendererUrl;
  try {
    const targets = await readEndpoint(
      `http://127.0.0.1:${options.fromPort}`,
      "/json/list",
      1500,
    );
    const page = targets.find(
      (item) => item.type === "page" && !item.url.startsWith("devtools://"),
    );
    if (page?.url.startsWith("http")) return page.url;
  } catch {
    // No inspectable sibling instance; fall back to the dev server default.
  }
  const fallback = "http://localhost:5173/";
  return (await probeHttp(fallback)) ? fallback : null;
}

function resolveElectronBinary() {
  const require = createRequire(path.join(DESKTOP_DIR, "package.json"));
  return require("electron");
}

async function launch(options) {
  if (!existsSync(MAIN_BUNDLE))
    throw new Error(
      `${MAIN_BUNDLE} is missing. Run electron-vite build or dev first.`,
    );
  const port = await findFreePort(
    options.portExplicit
      ? numberOption(options.port, "port", 1, 65535)
      : null,
  );
  const userDataPath =
    options.userData ??
    mkdtempSync(path.join(os.tmpdir(), "cocurdex-debug-"));
  const rendererUrl = await discoverRendererUrl(options);
  const entryPath = path.join(userDataPath, "debug-entry.mjs");
  writeFileSync(
    entryPath,
    `import { app } from "electron";\n` +
      `app.setAppPath(${JSON.stringify(DESKTOP_DIR)});\n` +
      `await import(${JSON.stringify(pathToFileURL(MAIN_BUNDLE).href)});\n`,
  );
  const env = {
    ...process.env,
    COCURDEX_REMOTE_DEBUGGING_PORT: String(port),
    COCURDEX_USER_DATA_PATH: userDataPath,
  };
  if (rendererUrl) env.ELECTRON_RENDERER_URL = rendererUrl;
  const child = spawn(resolveElectronBinary(), [entryPath], {
    detached: true,
    env,
    stdio: "ignore",
  });
  child.unref();
  const record = {
    pid: child.pid,
    port,
    userDataPath,
    rendererUrl,
    entryPath,
    createdAt: new Date().toISOString(),
  };
  writeFileSync(
    path.join(userDataPath, INSTANCE_RECORD),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  const base = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + options.readyTimeout;
  for (;;) {
    try {
      await readEndpoint(base, "/json/version", 1000);
      break;
    } catch (error) {
      if (Date.now() >= deadline) {
        try {
          process.kill(child.pid, "SIGTERM");
        } catch {
          // Already gone.
        }
        throw new Error(
          `Instance did not open CDP on ${base} within ${options.readyTimeout}ms: ${error.message}`,
        );
      }
      await delay(250);
    }
  }
  return record;
}

async function stop(options) {
  if (!options.userData)
    throw new Error("stop requires --user-data PATH from launch output");
  const recordPath = path.join(options.userData, INSTANCE_RECORD);
  if (!existsSync(recordPath))
    throw new Error(
      `${recordPath} is missing; refusing to remove a directory this tool did not create`,
    );
  const record = JSON.parse(readFileSync(recordPath, "utf8"));
  let signaled = false;
  try {
    process.kill(record.pid, "SIGTERM");
    signaled = true;
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  if (signaled) {
    const deadline = Date.now() + 5000;
    for (;;) {
      try {
        process.kill(record.pid, 0);
      } catch {
        break;
      }
      if (Date.now() >= deadline) break;
      await delay(200);
    }
  }
  rmSync(options.userData, { force: true, recursive: true });
  return { pid: record.pid, signaled, removed: options.userData };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: {
        type: "string",
        default: process.env.COCURDEX_REMOTE_DEBUGGING_PORT ?? "9222",
      },
      target: { type: "string" },
      url: { type: "string" },
      timeout: { type: "string", default: "10000" },
      interval: { type: "string", default: "200" },
      api: { type: "string", multiple: true, default: [] },
      wait: { type: "string" },
      "from-port": { type: "string", default: "9222" },
      "ready-timeout": { type: "string", default: "30000" },
      "renderer-url": { type: "string" },
      "user-data": { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(`Usage: node cdp.mjs <targets|preflight|eval EXPR|wait EXPR|shot [PATH]|launch|stop>
Options: --port PORT --target ID --url EXACT_URL --timeout MS --interval MS
preflight: --api METHOD (repeatable)
eval: --wait CONDITION (action once, then poll condition)
wait: use a read-only expression; it is evaluated repeatedly.
launch: starts an isolated extra instance (own port + userData) for
  concurrent debugging. --port PORT to pin, --renderer-url URL to override,
  --from-port PORT to copy the renderer URL from a sibling instance
  (default 9222), --user-data PATH to keep the profile, --ready-timeout MS.
stop: tears down a launch instance. --user-data PATH (required).
Timeouts bound each connection, request, or condition wait (default 10000ms).
A timed-out action may still complete in the app; inspect before retrying.`);
    return;
  }
  const [command, argument, ...extra] = positionals;
  if (
    !new Set([
      "targets",
      "preflight",
      "eval",
      "wait",
      "shot",
      "launch",
      "stop",
    ]).has(command) ||
    extra.length > 0
  )
    throw new Error("Invalid command. Use --help for usage.");
  if (["eval", "wait"].includes(command) && !argument)
    throw new Error(`${command} requires an expression`);
  if (["targets", "preflight", "launch", "stop"].includes(command) && argument)
    throw new Error(`${command} takes no positional argument`);
  if (values.wait && command !== "eval")
    throw new Error("--wait is only supported with eval");
  if (values.api.length > 0 && command !== "preflight")
    throw new Error("--api is only supported with preflight");
  const options = {
    ...values,
    timeout: numberOption(values.timeout, "timeout", 1, 60000),
    interval: numberOption(values.interval, "interval", 20, 5000),
    fromPort: numberOption(values["from-port"], "from-port", 1, 65535),
    readyTimeout: numberOption(
      values["ready-timeout"],
      "ready-timeout",
      1000,
      120000,
    ),
    rendererUrl: values["renderer-url"],
    userData: values["user-data"],
    portExplicit: process.argv
      .slice(2)
      .some((arg) => arg === "--port" || arg.startsWith("--port=")),
  };
  if (command === "launch") {
    console.log(JSON.stringify(await launch(options), null, 2));
    return;
  }
  if (command === "stop") {
    console.log(JSON.stringify(await stop(options), null, 2));
    return;
  }
  const port = numberOption(values.port, "port", 1, 65535);
  const base = `http://127.0.0.1:${port}`;
  if (command === "preflight") {
    const report = await preflight(base, options);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.apiAndDaemonReady ? 0 : 1;
    return;
  }
  const targets = await readEndpoint(base, "/json/list", options.timeout);
  if (command === "targets") {
    console.log(
      JSON.stringify(
        targets.map(({ id, type, title, url }) => ({ id, type, title, url })),
        null,
        2,
      ),
    );
    return;
  }
  const target = selectTarget(targets, options);
  const client = await connect(target, options.timeout);
  try {
    if (command === "eval") {
      const result = await evaluate(client, argument, options.timeout);
      if (options.wait)
        await waitFor(client, options.wait, options.timeout, options.interval);
      console.log(
        JSON.stringify(
          { targetId: target.id, result, conditionMet: Boolean(options.wait) },
          null,
          2,
        ),
      );
    } else if (command === "wait") {
      await waitFor(client, argument, options.timeout, options.interval);
      console.log(JSON.stringify({ targetId: target.id, conditionMet: true }));
    } else {
      const result = await client.send("Page.captureScreenshot", {
        format: "png",
      });
      if (!result?.data) throw new Error("Screenshot returned no image data");
      const output = argument ?? "/tmp/cocurdex.png";
      writeFileSync(output, Buffer.from(result.data, "base64"));
      console.log(`Screenshot -> ${output}`);
    }
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
