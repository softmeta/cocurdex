import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import { clickByRole, queryAllByRole } from "./lib/locate.mjs";
import { translate } from "./lib/navigate.mjs";

const SESSION_ID = "fixture-session-ledger-export";
const SESSION_ROW = /^Payment ledger export(?:$|\s+(?![(（]))/;
const FIRST_PROMPT = "Export ledger batch 1.";
const UI_TIMEOUT_MS = 30_000;
const MAX_ANCHOR_DRIFT_PX = 2;

const args = readScenarioArgs();

async function wheelUpUntil(session, label) {
  const point = await session.run(() => {
    const rect = window.__olderViewport.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...point,
  });
  for (let tick = 0; tick < 20; tick += 1) {
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      ...point,
      deltaX: 0,
      deltaY: -60,
    });
    await session.run(waitForIdle);
    const matches = await queryAllByRole(session, {
      role: "button",
      name: label,
    });
    if (matches.length > 0) return;
  }
  throw new Error(`No "${label}" button after scrolling up`);
}

function findViewport() {
  window.__olderViewport = [
    ...document.querySelectorAll("[data-slot=scroll-area-viewport]"),
  ].find((node) => node.querySelector("[data-testid=chat-timeline]"));
  return Boolean(window.__olderViewport?.scrollHeight > 4000);
}

function waitForIdle() {
  return new Promise((resolve) => {
    const viewport = window.__olderViewport;
    let last = `${viewport.scrollTop}:${viewport.scrollHeight}`;
    let stable = 0;
    const tick = () => {
      const now = `${viewport.scrollTop}:${viewport.scrollHeight}`;
      stable = now === last ? stable + 1 : 0;
      last = now;
      if (stable >= 30) resolve(true);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function anchorRow() {
  const viewport = window.__olderViewport;
  const bounds = viewport.getBoundingClientRect();
  const rows = [
    ...viewport.querySelectorAll("[data-testid=chat-timeline] > [data-index]"),
  ];
  const row = rows.find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return rect.bottom > bounds.top + 40 && rect.top < bounds.bottom;
  });
  return row ? row.textContent.slice(0, 80) : null;
}

function nearTopAndWatch(anchorText) {
  const viewport = window.__olderViewport;
  const find = () =>
    [
      ...viewport.querySelectorAll(
        "[data-testid=chat-timeline] > [data-index]",
      ),
    ].find((row) => row.textContent.startsWith(anchorText));
  const frames = [];
  let active = true;
  const sample = () => {
    if (!active) return;
    const row = find();
    frames.push({
      top: row ? Math.round(row.getBoundingClientRect().top) : null,
      scrollHeight: viewport.scrollHeight,
    });
    requestAnimationFrame(sample);
  };
  window.__stopOlderWatch = () => {
    active = false;
    return frames;
  };
  viewport.scrollTop = viewport.clientHeight;
  requestAnimationFrame(sample);
  return { scrollHeight: viewport.scrollHeight };
}

function firstPromptTop(text) {
  const viewport = window.__olderViewport;
  const row = [
    ...viewport.querySelectorAll("[data-testid=chat-timeline] > [data-index]"),
  ].find((candidate) => candidate.textContent.includes(text));
  return row
    ? Math.round(
        row.getBoundingClientRect().top - viewport.getBoundingClientRect().top,
      )
    : null;
}

runScenario("chat-older-transcript", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    await clickByRole(
      session,
      { role: "button", name: SESSION_ROW },
      UI_TIMEOUT_MS,
    );
    await session.waitUntil(findViewport, null, UI_TIMEOUT_MS);
    await session.run(waitForIdle);
    const jumpLabel = await translate(session, "common:jumpToTop");
    return { jumpLabel };
  },
  steps: [
    [
      "the session opens on its newest turns",
      async ({ session }) => {
        const snapshot = await daemonRequest(session, "session.snapshot", {
          sessionId: SESSION_ID,
        });
        check(snapshot?.olderBeforeSeq !== null, "window holds every turn", {
          messages: snapshot?.messages.length,
        });
        check(
          !snapshot.messages.some((m) => m.content === FIRST_PROMPT),
          "first prompt is inside the initial window",
        );
        return { messages: snapshot.messages.length };
      },
    ],
    [
      "older turns load near the top without moving the visible rows",
      async ({ session }) => {
        await session.run(() => {
          const viewport = window.__olderViewport;
          viewport.scrollTop = viewport.clientHeight * 1.5;
        });
        await session.run(waitForIdle);
        const anchor = await session.run(anchorRow);
        check(anchor !== null, "no fully visible row to anchor on");
        const before = await session.run(nearTopAndWatch, anchor);
        await session.waitUntil(
          (height) => window.__olderViewport.scrollHeight > height,
          before.scrollHeight,
          UI_TIMEOUT_MS,
        );
        await session.run(waitForIdle);
        const frames = await session.run(() => window.__stopOlderWatch());
        const tops = frames.map((frame) => frame.top);
        check(!tops.includes(null), "anchor row unmounted during prepend", {
          frames,
        });
        const drift = Math.max(...tops) - Math.min(...tops);
        check(drift <= MAX_ANCHOR_DRIFT_PX, "visible rows jumped on prepend", {
          drift,
          frames,
        });
        return { frames: frames.length, drift };
      },
    ],
    [
      "jump to top reaches the first prompt of the session",
      async ({ session, jumpLabel }) => {
        await session.run(() => {
          const viewport = window.__olderViewport;
          viewport.scrollTop = viewport.scrollHeight;
        });
        await session.run(waitForIdle);
        await wheelUpUntil(session, jumpLabel);
        await clickByRole(
          session,
          { role: "button", name: jumpLabel },
          UI_TIMEOUT_MS,
        );
        await session.waitUntil(
          (text) =>
            [
              ...window.__olderViewport.querySelectorAll(
                "[data-testid=chat-timeline] > [data-index]",
              ),
            ].some((row) => row.textContent.includes(text)),
          FIRST_PROMPT,
          UI_TIMEOUT_MS,
        );
        await session.run(waitForIdle);
        const top = await session.run(firstPromptTop, FIRST_PROMPT);
        const scrollTop = await session.run(
          () => window.__olderViewport.scrollTop,
        );
        check(scrollTop < 2, "jump to top stopped short", { scrollTop, top });
        return { top, scrollTop };
      },
    ],
    [
      "renderer has no errors",
      async ({ session }) => {
        const errors = await session.run(() => window.__scenario.errors);
        check(errors.length === 0, "renderer errors", errors);
        return {};
      },
    ],
  ],
  teardown: async () => ({}),
});
