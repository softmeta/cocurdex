import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clickByRole } from "./lib/locate.mjs";
import { translate } from "./lib/navigate.mjs";

const SESSION_ROW = /^Checkout audit log\s+(?![(（])/;
const UI_TIMEOUT_MS = 30_000;
const DRAG_STEP_PX = 20;
const MAX_THUMB_LEAD_PX = 24;
const IDLE_FRAMES = 30;
const SLOW_CPU_RATE = 4;

const args = readScenarioArgs();

function findViewport() {
  window.__dragViewport = [
    ...document.querySelectorAll("[data-slot=scroll-area-viewport]"),
  ].find((node) => node.querySelector("[data-testid=chat-timeline]"));
  return Boolean(window.__dragViewport?.scrollHeight > 4000);
}

function readThumb() {
  const viewport = window.__dragViewport;
  const thumb = viewport
    .closest("[data-slot=scroll-area]")
    .querySelector(
      "[data-slot=scroll-area-scrollbar][data-orientation=vertical] [data-slot=scroll-area-thumb]",
    );
  const rect = thumb.getBoundingClientRect();
  const bounds = viewport.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    trackTop: bounds.top,
    scrollTop: viewport.scrollTop,
    maxScrollTop: viewport.scrollHeight - viewport.clientHeight,
  };
}

function waitForIdle(frames) {
  return new Promise((resolve) => {
    const viewport = window.__dragViewport;
    let last = viewport.scrollTop;
    let stable = 0;
    const tick = () => {
      stable = viewport.scrollTop === last ? stable + 1 : 0;
      last = viewport.scrollTop;
      if (stable >= frames) resolve(true);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve(true)));
}

function recordFrames() {
  const viewport = window.__dragViewport;
  const timeline = viewport.querySelector("[data-testid=chat-timeline]");
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:-10px;top:0;width:1px;height:1px;pointer-events:none";
  document.body.append(probe);
  const frames = [];
  let observer = null;
  let active = true;
  const sample = () => {
    const bounds = viewport.getBoundingClientRect();
    const rows = [...timeline.querySelectorAll(":scope > [data-index]")].map(
      (row) => ({
        index: Number(row.dataset.index),
        rect: row.getBoundingClientRect(),
      }),
    );
    const visible = rows.filter(
      ({ rect }) => rect.bottom > bounds.top && rect.top < bounds.bottom,
    );
    const last = rows.reduce(
      (found, row) => (found && found.index > row.index ? found : row),
      null,
    );
    frames.push({
      gap: Math.round(
        viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop,
      ),
      visibleRows: visible.length,
      lastIndex: last?.index ?? null,
      lastRowBottom: last ? Math.round(last.rect.bottom) : null,
    });
  };
  const tick = () => {
    observer?.disconnect();
    if (!active) return;
    observer = new ResizeObserver(sample);
    observer.observe(probe);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  window.__stopFrames = () => {
    active = false;
    probe.remove();
    return frames;
  };
}

async function dragThumb(session, toY) {
  const start = await session.run(readThumb);
  const mouse = (type, y, extra = {}) =>
    session.send("Input.dispatchMouseEvent", {
      type,
      x: start.x,
      y,
      button: "left",
      ...extra,
    });
  await mouse("mouseMoved", start.y, { button: "none" });
  await mouse("mousePressed", start.y, { buttons: 1, clickCount: 1 });
  const direction = Math.sign(toY - start.y);
  const samples = [];
  let y = start.y;
  while (Math.abs(toY - y) > 0.5) {
    y += direction * Math.min(DRAG_STEP_PX, Math.abs(toY - y));
    await mouse("mouseMoved", y, { buttons: 1 });
    await session.run(nextFrame);
    const thumb = await session.run(readThumb);
    samples.push({
      pointer: Math.round(y),
      lead: Math.round(start.y + (y - start.y) - thumb.y),
      scrollTop: Math.round(thumb.scrollTop),
    });
  }
  await mouse("mouseReleased", toY, { clickCount: 1 });
  await session.run(waitForIdle, IDLE_FRAMES);
  return { ...(await session.run(readThumb)), samples };
}

runScenario("chat-long-session-scroll", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    const latestLabel = await translate(session, "common:jumpToLatest");
    await clickByRole(
      session,
      { role: "button", name: SESSION_ROW },
      UI_TIMEOUT_MS,
    );
    await session.waitUntil(findViewport, null, UI_TIMEOUT_MS);
    await session.run(waitForIdle, IDLE_FRAMES);
    return { latestLabel };
  },
  steps: [
    [
      "the thumb follows the pointer from the bottom to the top",
      async ({ session }) => {
        const before = await session.run(readThumb);
        check(
          before.maxScrollTop - before.scrollTop < 2,
          "session did not open at the bottom",
          before,
        );
        const after = await dragThumb(session, before.trackTop);
        check(after.scrollTop < 100, "drag up was pulled back down", {
          before,
          after,
        });
        const maxLead = Math.max(
          ...after.samples.map((sample) => Math.abs(sample.lead)),
        );
        check(maxLead <= MAX_THUMB_LEAD_PX, "thumb drifted from the pointer", {
          samples: after.samples,
        });
        return { before: before.scrollTop, after: after.scrollTop, maxLead };
      },
    ],
    [
      "dragging the thumb down a little stays in place",
      async ({ session }) => {
        const before = await session.run(readThumb);
        const after = await dragThumb(session, before.y + 60);
        check(
          after.scrollTop > before.scrollTop &&
            after.maxScrollTop - after.scrollTop > after.maxScrollTop / 2,
          "drag down jumped to the bottom",
          { before, after },
        );
        return { before: before.scrollTop, after: after.scrollTop };
      },
    ],
    [
      "jump to latest lands at the bottom without a blank or shifting frame",
      async ({ session, latestLabel }) => {
        await session.send("Emulation.setCPUThrottlingRate", {
          rate: SLOW_CPU_RATE,
        });
        await session.run(recordFrames);
        await clickByRole(session, { role: "button", name: latestLabel });
        await session.waitUntil(
          () => {
            const viewport = window.__dragViewport;
            return (
              viewport.scrollHeight -
                viewport.clientHeight -
                viewport.scrollTop <
              2
            );
          },
          null,
          UI_TIMEOUT_MS,
        );
        await session.run(waitForIdle, IDLE_FRAMES);
        const frames = await session.run(() => window.__stopFrames());
        await session.send("Emulation.setCPUThrottlingRate", { rate: 1 });
        const firstAtBottom = frames.findIndex(
          (frame) => frame.gap < 2 && frame.visibleRows > 0,
        );
        const settled = frames.slice(firstAtBottom);
        check(
          frames.every((frame) => frame.visibleRows > 0),
          "jump to latest painted a blank frame",
          { frames },
        );
        check(
          firstAtBottom >= 0 &&
            settled.every(
              (frame) =>
                frame.gap < 2 &&
                frame.lastIndex === settled[0].lastIndex &&
                Math.abs(frame.lastRowBottom - settled[0].lastRowBottom) <= 1,
            ),
          "content moved after reaching the bottom",
          { frames },
        );
        return { frames: frames.length, firstAtBottom };
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
