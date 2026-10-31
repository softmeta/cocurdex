const DAEMON_WEBSOCKET_PROTOCOL = "cocurdex.v1";
const TOKEN_PROTOCOL_PREFIX = "cocurdex.token.";
const REQUEST_TIMEOUT_MS = 60_000;

function requestOnce({ webSocketUrl, token }, method, params) {
  const id = crypto.randomUUID();
  const message =
    params === undefined
      ? { id, method, token }
      : { id, method, params, token };
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl, [
      DAEMON_WEBSOCKET_PROTOCOL,
      `${TOKEN_PROTOCOL_PREFIX}${token}`,
    ]);
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.close();
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(
      () => finish(new Error(`Daemon request ${method} timed out`)),
      REQUEST_TIMEOUT_MS,
    );
    socket.addEventListener("open", () => socket.send(JSON.stringify(message)));
    socket.addEventListener("message", (event) => {
      const response = JSON.parse(String(event.data));
      if (response.id !== id) return;
      if (response.error) {
        finish(
          new Error(
            `${method}: ${response.error.message} (${response.error.code})`,
          ),
        );
        return;
      }
      finish(null, response.result);
    });
    socket.addEventListener("error", () =>
      finish(new Error(`Daemon connection failed for ${method}`)),
    );
    socket.addEventListener("close", () =>
      finish(new Error(`Daemon disconnected before replying to ${method}`)),
    );
  });
}

const connections = new WeakMap();

async function daemonConnection(session) {
  if (!connections.has(session)) {
    await session.waitUntil(() => Boolean(window.desktopApi), null, 30_000);
    connections.set(
      session,
      await session.run(() => window.desktopApi.getDaemonConnection()),
    );
  }
  return connections.get(session);
}

export async function daemonRequest(session, method, params) {
  return requestOnce(await daemonConnection(session), method, params);
}
