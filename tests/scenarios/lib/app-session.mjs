import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  connect,
  evaluate,
  readEndpoint,
  selectTarget,
  waitFor,
} from "../../../.agents/skills/debug-desktop/scripts/cdp-client.mjs";
import { startScreencast } from "../../../.agents/skills/debug-desktop/scripts/cdp-screencast.mjs";
import {
  collectFailureDiagnostics,
  watchPageEvents,
} from "./page-diagnostics.mjs";

export const DEFAULT_URL = "http://localhost:5173/";
const EVAL_TIMEOUT_MS = 30_000;
const RELOAD_TIMEOUT_MS = 60_000;
const RELOAD_POLL_TIMEOUT_MS = 2_000;
const WAIT_INTERVAL_MS = 100;

const PAGE_HELPERS = `(() => {
  if (window.__scenario) return true;
  const errors = [];
  window.addEventListener("error", (event) => errors.push(String(event.message)));
  window.addEventListener("unhandledrejection", (event) => errors.push(String(event.reason)));
  window.__scenario = {
    errors,
    resetRequests() {
      performance.setResourceTimingBufferSize(20000);
      performance.clearResourceTimings();
    },
    requests(fragment) {
      return performance.getEntriesByType("resource").filter((entry) => entry.name.includes(fragment));
    },
    setInput(element, value) {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(element, value);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    },
    pressEnter(element) {
      for (const type of ["keydown", "keyup"]) {
        element.dispatchEvent(new KeyboardEvent(type, { key: "Enter", code: "Enter", bubbles: true }));
      }
    },
    byLabel(label) {
      return document.querySelector('[aria-label="' + CSS.escape(label) + '"]');
    },
    sleep(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
  return true;
})()`;

export function readScenarioArgs(extraOptions = {}) {
  const { values } = parseArgs({
    options: {
      port: { type: "string" },
      keep: { type: "boolean", default: false },
      "fixture-db": { type: "boolean", default: false },
      url: { type: "string", default: DEFAULT_URL },
      ...extraOptions,
    },
  });
  return values;
}

function invocation(fn, arg) {
  return `(${fn.toString()})(${JSON.stringify(arg ?? null)})`;
}

async function attachPage(target) {
  const client = await connect(target, 10_000);
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: PAGE_HELPERS,
  });
  await evaluate(client, PAGE_HELPERS, EVAL_TIMEOUT_MS);
  return client;
}

function pageSession(client) {
  return {
    run: (fn, arg) => evaluate(client, invocation(fn, arg), EVAL_TIMEOUT_MS),
    waitUntil: (fn, arg, timeout = 15_000) =>
      waitFor(client, invocation(fn, arg), timeout, WAIT_INTERVAL_MS),
    send: (method, params) => client.send(method, params, EVAL_TIMEOUT_MS),
    on: (method, handler) => client.on(method, handler),
    close: () => client.close(),
  };
}

async function waitForPage(base, urlFragment, timeout) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const targets = await readEndpoint(base, "/json/list", 5_000);
    const page = targets.find(
      (item) =>
        item.type === "page" &&
        item.webSocketDebuggerUrl &&
        item.url.includes(urlFragment),
    );
    if (page) return page;
    if (Date.now() >= deadline) {
      throw new Error(`No page with "${urlFragment}" within ${timeout}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
}

export async function openAppSession({ port, url }) {
  const base = `http://127.0.0.1:${port}`;
  const targets = await readEndpoint(base, "/json/list", 5_000);
  const client = await attachPage(selectTarget(targets, { url }));
  const pageEvents = await watchPageEvents(client);
  return {
    ...pageSession(client),
    pageEvents,
    rendererUrl: url,
    async openPage(urlFragment, timeout = 30_000) {
      return pageSession(
        await attachPage(await waitForPage(base, urlFragment, timeout)),
      );
    },
    async reload() {
      const previousOrigin = await evaluate(
        client,
        "performance.timeOrigin",
        EVAL_TIMEOUT_MS,
      );
      await client.send("Page.reload", {}, EVAL_TIMEOUT_MS);
      const deadline = Date.now() + RELOAD_TIMEOUT_MS;
      const loaded = `performance.timeOrigin !== ${previousOrigin} && document.readyState === "complete" && Boolean(window.desktopApi)`;
      while (Date.now() < deadline) {
        try {
          if (await evaluate(client, loaded, RELOAD_POLL_TIMEOUT_MS)) {
            await evaluate(client, PAGE_HELPERS, EVAL_TIMEOUT_MS);
            return;
          }
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
      }
      throw new Error(`Page did not reload within ${RELOAD_TIMEOUT_MS}ms`);
    },
    async pageUrls() {
      const targets = await readEndpoint(base, "/json/list", 5_000);
      return targets
        .filter((item) => item.type === "page")
        .map((item) => item.url);
    },
  };
}

export function recordScreencast(session, dir) {
  return startScreencast(session, { dir });
}

export class ScenarioFailure extends Error {}

export function check(condition, message, details) {
  if (!condition) {
    throw new ScenarioFailure(
      details ? `${message}: ${JSON.stringify(details)}` : message,
    );
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

export async function runScenario(name, { open, setup, steps, teardown }) {
  const report = { scenario: name, passed: true, steps: [] };
  let opened;
  let context;
  let recording;
  try {
    opened = await open();
    const recordRoot = process.env.COCURDEX_SCENARIO_RECORD_DIR;
    if (recordRoot) {
      recording = await recordScreencast(
        opened.session,
        path.join(recordRoot, name),
      );
    }
    context = { ...opened, ...(await setup(opened)) };
    for (const [stepName, step] of steps) {
      const startedAt = Date.now();
      try {
        const details = await step(context);
        report.steps.push({
          step: stepName,
          ok: true,
          ms: Date.now() - startedAt,
          ...details,
        });
      } catch (error) {
        report.passed = false;
        report.steps.push({
          step: stepName,
          ok: false,
          ms: Date.now() - startedAt,
          error: errorMessage(error),
        });
        break;
      }
    }
  } catch (error) {
    report.passed = false;
    report.setupError = errorMessage(error);
  } finally {
    if (recording) {
      try {
        const { dir, frames } = await recording.stop();
        report.recording = { dir, frameCount: frames.length };
      } catch (error) {
        report.recordingError = errorMessage(error);
      }
    }
    const artifacts = process.env.COCURDEX_TEST_ARTIFACTS_DIR;
    if (!report.passed && opened?.session && artifacts) {
      try {
        await mkdir(artifacts, { recursive: true });
        const screenshot = await opened.session.send("Page.captureScreenshot", {
          format: "png",
        });
        await writeFile(
          path.join(artifacts, `${name}.png`),
          Buffer.from(screenshot.data, "base64"),
        );
      } catch (error) {
        report.screenshotError = errorMessage(error);
      }
      try {
        const diagnostics = await collectFailureDiagnostics(
          opened.session,
          opened.session.rendererUrl,
        );
        await writeFile(
          path.join(artifacts, `${name}.diagnostics.json`),
          JSON.stringify(diagnostics, null, 2),
        );
      } catch (error) {
        report.diagnosticsError = errorMessage(error);
      }
    }
    if (context) {
      try {
        report.teardown = await teardown(context);
      } catch (error) {
        report.passed = false;
        report.teardownError = errorMessage(error);
      }
    }
    if (opened) {
      try {
        await opened.close({ passed: report.passed });
      } catch (error) {
        report.passed = false;
        report.closeError = errorMessage(error);
      }
    }
  }
  const artifacts = process.env.COCURDEX_TEST_ARTIFACTS_DIR;
  if (artifacts) {
    await mkdir(artifacts, { recursive: true });
    await writeFile(
      path.join(artifacts, `${name}.json`),
      JSON.stringify(report, null, 2),
    );
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.passed ? 0 : 1);
}
