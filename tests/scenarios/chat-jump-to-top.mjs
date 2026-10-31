import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clickByRole, queryAllByRole, waitForRole } from "./lib/locate.mjs";
import { translate } from "./lib/navigate.mjs";

const SESSION_ROW = /^Checkout audit log\s+(?![(（])/;
const UI_TIMEOUT_MS = 30_000;
const JUMP_TIMEOUT_MS = 5_000;
const MAX_WHEEL_TICKS = 20;

const args = readScenarioArgs();

function readViewport() {
  const viewport = window.__jumpViewport;
  if (!viewport) return null;
  const rect = viewport.getBoundingClientRect();
  return {
    scrollTop: viewport.scrollTop,
    scrollHeight: viewport.scrollHeight,
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

async function wheel(session, point, deltaY, times) {
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...point,
  });
  for (let index = 0; index < times; index += 1) {
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      ...point,
      deltaX: 0,
      deltaY,
    });
    await session.waitUntil(
      () =>
        new Promise((resolve) => requestAnimationFrame(() => resolve(true))),
      null,
    );
  }
}

function recordJumpFrames() {
  const viewport = window.__jumpViewport;
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
    const first = rows.find(({ index }) => index === 0);
    frames.push({
      scrollTop: Math.round(viewport.scrollTop),
      visibleRows: visible.length,
      firstRowTop: first ? Math.round(first.rect.top) : null,
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
  window.__stopJumpFrames = () => {
    active = false;
    probe.remove();
    return frames;
  };
}

function waitForScrollIdle() {
  return new Promise((resolve) => {
    const viewport = window.__jumpViewport;
    let last = viewport.scrollTop;
    let stableFrames = 0;
    const tick = () => {
      stableFrames = viewport.scrollTop === last ? stableFrames + 1 : 0;
      last = viewport.scrollTop;
      if (stableFrames >= 20) resolve(true);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function scrollUntilJumpToTop(session, point, jumpLabel) {
  for (let tick = 0; tick < MAX_WHEEL_TICKS; tick += 1) {
    await wheel(session, point, -60, 1);
    await session.run(waitForScrollIdle);
    const matches = await queryAllByRole(session, {
      role: "button",
      name: jumpLabel,
    });
    if (matches.length > 0) return;
  }
  throw new Error(`No "${jumpLabel}" button after ${MAX_WHEEL_TICKS} ticks`);
}

function watchJumpButtonWhileScrollingUp(latestLabel) {
  const viewport = window.__jumpViewport;
  const state = { flips: [], reversals: 0, last: viewport.scrollTop };
  const onScroll = () => {
    if (viewport.scrollTop > state.last) state.reversals += 1;
    state.last = viewport.scrollTop;
    const nearTop = viewport.scrollTop < 200;
    const latest = document.querySelector(
      `button[aria-label="${CSS.escape(latestLabel)}"]`,
    );
    if (latest && !nearTop) state.flips.push(viewport.scrollTop);
  };
  viewport.addEventListener("scroll", onScroll);
  window.__stopJumpWatch = () => {
    viewport.removeEventListener("scroll", onScroll);
    requestAnimationFrame(onScroll);
    return state;
  };
}

runScenario("chat-jump-to-top", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    await clickByRole(
      session,
      { role: "button", name: SESSION_ROW },
      UI_TIMEOUT_MS,
    );
    await session.waitUntil(
      () => {
        window.__jumpViewport = [
          ...document.querySelectorAll("[data-slot=scroll-area-viewport]"),
        ].find((node) => node.scrollHeight > 4000);
        return Boolean(window.__jumpViewport);
      },
      null,
      UI_TIMEOUT_MS,
    );
    const [jumpLabel, latestLabel] = await Promise.all(
      ["common:jumpToTop", "common:jumpToLatest"].map((key) =>
        translate(session, key),
      ),
    );
    return { jumpLabel, latestLabel };
  },
  steps: [
    [
      "scrolling up never offers jump to latest",
      async ({ session, latestLabel }) => {
        await session.run(() => {
          const viewport = window.__jumpViewport;
          viewport.scrollTop = viewport.scrollHeight;
        });
        await session.run(waitForScrollIdle);
        const point = await session.run(readViewport);
        await session.run(watchJumpButtonWhileScrollingUp, latestLabel);
        let scrollTop = point.scrollTop;
        while (scrollTop > 200) {
          await wheel(session, point, -120, 5);
          scrollTop = (await session.run(readViewport)).scrollTop;
        }
        const state = await session.run(() => window.__stopJumpWatch());
        check(
          state.flips.length === 0,
          "jump to latest shown while scrolling up",
          state,
        );
        return state;
      },
    ],
    [
      "jump to top reaches the first message",
      async ({ session, jumpLabel }) => {
        await session.run(() => {
          const viewport = window.__jumpViewport;
          viewport.scrollTop = viewport.scrollHeight;
        });
        await session.waitUntil(
          () => {
            const viewport = window.__jumpViewport;
            return (
              viewport.scrollHeight -
                viewport.scrollTop -
                viewport.clientHeight <
              2
            );
          },
          null,
          UI_TIMEOUT_MS,
        );
        const before = await session.run(readViewport);
        await scrollUntilJumpToTop(session, before, jumpLabel);
        await session.run(recordJumpFrames);
        await clickByRole(session, {
          role: "button",
          name: jumpLabel,
        });
        const reached = await session
          .waitUntil(
            () => window.__jumpViewport.scrollTop === 0,
            null,
            JUMP_TIMEOUT_MS,
          )
          .then(
            () => true,
            () => false,
          );
        await session.run(waitForScrollIdle);
        const after = await session.run(readViewport);
        const frames = await session.run(() => window.__stopJumpFrames());
        check(reached, "jump stopped before the top", { before, after });
        const blankFrames = frames.filter((frame) => frame.visibleRows === 0);
        check(blankFrames.length === 0, "jump to top painted blank frames", {
          frames,
        });
        const topPositions = new Set(
          frames
            .filter(
              (frame) => frame.scrollTop === 0 && frame.firstRowTop !== null,
            )
            .map((frame) => frame.firstRowTop),
        );
        check(topPositions.size === 1, "first message moved after the jump", {
          frames,
        });
        return { before, after, frames: frames.length };
      },
    ],
    [
      "jump controls return after scrolling away from the top",
      async ({ session, latestLabel }) => {
        const point = await session.run(readViewport);
        await wheel(session, point, 240, 4);
        await session.run(waitForScrollIdle);
        await waitForRole(
          session,
          { role: "button", name: latestLabel },
          UI_TIMEOUT_MS,
        );
        return {
          scrollTop: (await session.run(readViewport)).scrollTop,
        };
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
