const EVENT_LIMIT = 200;
const PENDING_LIMIT = 50;
const TEXT_LIMIT = 2_000;
const PROBE_TIMEOUT_MS = 10_000;
const PROBE_PATHS = ["", "src/main.tsx", "src/lib/product-api.ts"];

function clip(text) {
  return String(text ?? "").slice(0, TEXT_LIMIT);
}

function remoteValue(arg) {
  return arg.value ?? arg.description ?? arg.unserializableValue ?? "";
}

export async function watchPageEvents(client) {
  const events = {
    exceptions: [],
    console: [],
    failedRequests: [],
    crashes: [],
  };
  const record = (list, entry) => {
    list.push({ at: new Date().toISOString(), ...entry });
    if (list.length > EVENT_LIMIT) list.shift();
  };
  const pendingUrls = new Map();
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) =>
    record(events.exceptions, {
      text: clip(
        exceptionDetails.exception?.description ?? exceptionDetails.text,
      ),
      url: exceptionDetails.url ?? null,
    }),
  );
  client.on("Runtime.consoleAPICalled", ({ type, args }) => {
    if (type !== "error" && type !== "warning") return;
    record(events.console, {
      level: type,
      text: clip(args.map(remoteValue).join(" ")),
    });
  });
  client.on("Log.entryAdded", ({ entry }) => {
    if (entry.level !== "error") return;
    record(events.console, {
      level: entry.source,
      text: clip(entry.text),
      url: entry.url ?? null,
    });
  });
  client.on("Network.requestWillBeSent", ({ requestId, request }) =>
    pendingUrls.set(requestId, { url: request.url, startedAt: Date.now() }),
  );
  client.on("Network.loadingFinished", ({ requestId }) =>
    pendingUrls.delete(requestId),
  );
  client.on("Network.loadingFailed", ({ requestId, errorText, canceled }) => {
    record(events.failedRequests, {
      url: pendingUrls.get(requestId)?.url ?? null,
      errorText,
      canceled: Boolean(canceled),
    });
    pendingUrls.delete(requestId);
  });
  client.on("Inspector.targetCrashed", () => record(events.crashes, {}));
  await client.send("Runtime.enable");
  await client.send("Log.enable");
  await client.send("Inspector.enable");
  await client.send("Network.enable", {
    maxTotalBufferSize: 0,
    maxResourceBufferSize: 0,
  });
  return {
    snapshot: () => ({
      ...events,
      pendingRequests: [...pendingUrls.values()]
        .map(({ url, startedAt }) => ({ url, ageMs: Date.now() - startedAt }))
        .sort((left, right) => right.ageMs - left.ageMs)
        .slice(0, PENDING_LIMIT),
    }),
  };
}

function readPageState() {
  const root = document.getElementById("root");
  return {
    url: location.href,
    readyState: document.readyState,
    hasDesktopApi: Boolean(window.desktopApi),
    rootChildren: root?.childElementCount ?? null,
    bootSplash: Boolean(document.querySelector(".boot-splash-static")),
    heapUsed: performance.memory?.usedJSHeapSize ?? null,
    scenarioErrors: window.__scenario?.errors ?? null,
  };
}

async function probeRenderer(baseUrl) {
  const results = [];
  for (const probePath of PROBE_PATHS) {
    const startedAt = performance.now();
    try {
      const response = await fetch(new URL(probePath, baseUrl), {
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      const body = await response.text();
      results.push({
        path: probePath,
        status: response.status,
        bytes: body.length,
        ms: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      results.push({
        path: probePath,
        error: error instanceof Error ? error.message : String(error),
        ms: Math.round(performance.now() - startedAt),
      });
    }
  }
  return results;
}

export async function collectFailureDiagnostics(session, rendererUrl) {
  const diagnostics = { events: session.pageEvents?.snapshot() ?? null };
  try {
    diagnostics.page = await session.run(readPageState);
  } catch (error) {
    diagnostics.pageError =
      error instanceof Error ? error.message : String(error);
  }
  if (rendererUrl) {
    diagnostics.renderer = await probeRenderer(rendererUrl);
  }
  return diagnostics;
}
