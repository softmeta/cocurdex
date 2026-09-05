import { setTimeout as delay } from "node:timers/promises";

export async function readEndpoint(base, route, timeout) {
  try {
    const response = await fetch(`${base}${route}`, {
      signal: AbortSignal.timeout(timeout),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    const reason = error.cause?.code ?? error.message;
    throw new Error(`Cannot read ${base}${route}: ${reason}`, { cause: error });
  }
}

export function selectTarget(targets, { target, url } = {}) {
  const pages = targets.filter(
    (item) =>
      item.type === "page" &&
      item.webSocketDebuggerUrl &&
      !item.url.startsWith("devtools://"),
  );
  const matches = pages.filter(
    (item) => (!target || item.id === target) && (!url || item.url === url),
  );
  if (matches.length !== 1) {
    const choices = matches.length > 0 ? matches : pages;
    throw new Error(
      `Expected one page, found ${matches.length}. Use --target ID or --url EXACT_URL.\n${choices.map((item) => `${item.id}\t${item.title}\t${item.url}`).join("\n")}`,
    );
  }
  return matches[0];
}

export async function connect(target, timeout) {
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  let nextId = 0;
  const pending = new Map();
  function rejectPending(error) {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    pending.clear();
  }
  socket.addEventListener("message", (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      rejectPending(new Error("Invalid JSON from CDP"));
      socket.close();
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error)
      request.reject(
        new Error(`${request.method}: ${JSON.stringify(message.error)}`),
      );
    else request.resolve(message.result);
  });
  socket.addEventListener("close", () =>
    rejectPending(new Error("CDP connection closed")),
  );
  socket.addEventListener("error", () =>
    rejectPending(new Error("CDP WebSocket error")),
  );
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error(`CDP connection timed out after ${timeout}ms`));
    }, timeout);
    socket.addEventListener(
      "open",
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
    socket.addEventListener(
      "error",
      () => {
        clearTimeout(timer);
        reject(new Error("Cannot open CDP WebSocket"));
      },
      { once: true },
    );
    socket.addEventListener(
      "close",
      () => {
        clearTimeout(timer);
        reject(new Error("CDP closed during connection"));
      },
      { once: true },
    );
  });
  return {
    send(method, params = {}, requestTimeout = timeout) {
      if (socket.readyState !== WebSocket.OPEN)
        return Promise.reject(new Error("CDP connection is not open"));
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out after ${requestTimeout}ms`));
        }, requestTimeout);
        pending.set(id, { resolve, reject, timer, method });
        try {
          socket.send(JSON.stringify({ id, method, params }));
        } catch (error) {
          clearTimeout(timer);
          pending.delete(id);
          reject(error);
        }
      });
    },
    close() {
      rejectPending(new Error("CDP client closed"));
      socket.close();
    },
  };
}

export async function evaluate(client, expression, timeout) {
  const response = await client.send(
    "Runtime.evaluate",
    {
      expression,
      returnByValue: true,
      awaitPromise: true,
      timeout,
    },
    timeout,
  );
  if (response.exceptionDetails) {
    const details = response.exceptionDetails;
    throw new Error(
      `Evaluation failed: ${details.exception?.description ?? details.text}\n${JSON.stringify(details, null, 2)}`,
    );
  }
  const result = response.result;
  if (result?.unserializableValue !== undefined)
    return result.unserializableValue;
  return result?.value;
}

export async function waitFor(client, expression, timeout, interval) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    if (
      await evaluate(
        client,
        `(async () => Boolean(await (${expression})))()`,
        remaining,
      )
    )
      return true;
    await delay(Math.min(interval, Math.max(0, deadline - Date.now())));
  }
  throw new Error(
    `Condition did not become true within ${timeout}ms: ${expression}`,
  );
}
