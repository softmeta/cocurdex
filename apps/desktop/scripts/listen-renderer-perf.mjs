#!/usr/bin/env node

const DEFAULT_PORT = 9222;
const RECONNECT_DELAY_MS = 1000;

const port = Number(process.env.COCURDEX_REMOTE_DEBUGGING_PORT ?? DEFAULT_PORT);
const includeAllConsole = process.argv.includes("--all");

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error(`Invalid CDP port: ${port}`);
  process.exit(1);
}

function formatRemoteObject(object) {
  if (object?.value !== undefined) {
    return object.value;
  }

  if (object?.unserializableValue !== undefined) {
    return object.unserializableValue;
  }

  if (object?.description) {
    return object.description;
  }

  return "";
}

function formatConsoleArgs(args = []) {
  return args.map(formatRemoteObject).join(" ");
}

function shouldPrint(line) {
  return includeAllConsole || line.includes("[perf]");
}

async function findRendererTarget() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) {
    throw new Error(`CDP target list failed: ${response.status}`);
  }

  const targets = await response.json();
  const pageTargets = targets.filter(
    (target) => target.type === "page" && target.webSocketDebuggerUrl,
  );

  return (
    pageTargets.find((target) => target.url?.includes("localhost")) ??
    pageTargets.find((target) => !target.url?.startsWith("devtools://")) ??
    null
  );
}

function send(socket, id, method, params = {}) {
  socket.send(JSON.stringify({ id, method, params }));
}

async function listen() {
  if (typeof WebSocket === "undefined") {
    throw new Error("This script requires a Node.js runtime with WebSocket.");
  }

  const target = await findRendererTarget();
  if (!target) {
    throw new Error(`No renderer CDP target found on port ${port}.`);
  }

  console.info(
    `[cdp] listening to ${target.title || "renderer"} (${target.url})`,
  );

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 1;

  socket.addEventListener("open", () => {
    send(socket, nextId++, "Runtime.enable");
    send(socket, nextId++, "Log.enable");
  });

  socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);

    if (payload.method === "Runtime.consoleAPICalled") {
      const line = formatConsoleArgs(payload.params?.args);
      if (shouldPrint(line)) {
        console.log(line);
      }
      return;
    }

    if (payload.method === "Log.entryAdded") {
      const line = payload.params?.entry?.text ?? "";
      if (shouldPrint(line)) {
        console.log(line);
      }
    }
  });

  return new Promise((resolve) => {
    socket.addEventListener("close", resolve);
    socket.addEventListener("error", resolve);
  });
}

while (true) {
  try {
    await listen();
  } catch (error) {
    console.error(
      `[cdp] ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  await new Promise((resolve) => setTimeout(resolve, RECONNECT_DELAY_MS));
}
