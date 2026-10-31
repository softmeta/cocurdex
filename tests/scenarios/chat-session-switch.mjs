import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clickByRole } from "./lib/locate.mjs";

const LONG_SESSION = "Checkout audit log";
const OTHER_SESSION = "Draft release notes";
const SWITCHES = 6;
const SETTLE_FRAMES = 20;
const MAX_WHEEL_TICKS = 300;
const UI_TIMEOUT_MS = 30_000;

const args = readScenarioArgs();

function sessionRow(title) {
  return { role: "button", name: new RegExp(`^${title}\\s+(?![(（])`) };
}

function installPaintSampler() {
  const isVisible = (node) => {
    for (let el = node; el; el = el.parentElement) {
      if (Number(getComputedStyle(el).opacity) === 0) return false;
    }
    return true;
  };
  const timelineRows = () => {
    const timeline = document.querySelector("[data-testid=chat-timeline]");
    if (!timeline || !isVisible(timeline)) return null;
    return [...timeline.querySelectorAll(":scope > [data-index]")]
      .map((row) => {
        const rect = row.getBoundingClientRect();
        return {
          index: Number(row.dataset.index),
          top: Math.round(rect.top),
          bottom: Math.round(rect.bottom),
        };
      })
      .sort((a, b) => a.index - b.index);
  };
  const overlapsOf = (rows) =>
    rows.flatMap((row, position) => {
      const next = rows[position + 1];
      return next && row.bottom > next.top + 1 ? [{ row, next }] : [];
    });
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:-10px;top:0;width:1px;height:1px;pointer-events:none";
  document.body.append(probe);
  const sampler = { recorder: null };
  const sample = () => {
    const recorder = sampler.recorder;
    if (!recorder || recorder.done) return;
    recorder.frames += 1;
    const rows = timelineRows();
    if (!rows) {
      recorder.blankFrames += 1;
      recorder.stableFrames = 0;
      return;
    }
    const overlaps = overlapsOf(rows);
    if (overlaps.length > 0) recorder.overlaps.push(overlaps);
    const signature = JSON.stringify(rows);
    recorder.stableFrames =
      signature === recorder.previous ? recorder.stableFrames + 1 : 0;
    recorder.previous = signature;
    if (recorder.settleFrames && recorder.stableFrames >= recorder.settleFrames)
      recorder.done = true;
  };
  let observer = null;
  const tick = () => {
    observer?.disconnect();
    observer = new ResizeObserver(sample);
    observer.observe(probe);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  sampler.start = (settleFrames) => {
    sampler.recorder = {
      frames: 0,
      blankFrames: 0,
      overlaps: [],
      previous: "",
      stableFrames: 0,
      settleFrames,
      done: false,
    };
  };
  sampler.stop = () => {
    const { frames, blankFrames, overlaps } = sampler.recorder;
    sampler.recorder.done = true;
    return { frames, blankFrames, overlaps };
  };
  window.__paintSampler = sampler;
}

function timelineViewport() {
  return document
    .querySelector("[data-testid=chat-timeline]")
    .closest("[data-slot=scroll-area-viewport]");
}

async function switchTo(session, title) {
  await session.run(
    (settleFrames) => window.__paintSampler.start(settleFrames),
    SETTLE_FRAMES,
  );
  await clickByRole(session, sessionRow(title), UI_TIMEOUT_MS);
  await session.waitUntil(
    () => window.__paintSampler.recorder.done,
    null,
    UI_TIMEOUT_MS,
  );
  return session.run(() => window.__paintSampler.stop());
}

async function wheelToTop(session) {
  await session.run((source) => {
    window.__timelineViewport = new Function(`return (${source})`)();
  }, timelineViewport.toString());
  const point = await session.run(() => {
    const viewport = window.__timelineViewport();
    viewport.scrollTop = viewport.scrollHeight;
    const rect = viewport.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...point,
  });
  for (let tick = 0; tick < MAX_WHEEL_TICKS; tick += 1) {
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseWheel",
      ...point,
      deltaX: 0,
      deltaY: -120,
    });
    const scrollTop = await session.run(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() =>
            resolve(window.__timelineViewport().scrollTop),
          ),
        ),
    );
    if (scrollTop === 0) return;
  }
  throw new Error(`Did not reach the top after ${MAX_WHEEL_TICKS} ticks`);
}

runScenario("chat-session-switch", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    await session.run(installPaintSampler);
    await clickByRole(session, sessionRow(OTHER_SESSION), UI_TIMEOUT_MS);
    return {};
  },
  steps: [
    [
      "switching sessions never paints overlapping rows",
      async ({ session }) => {
        const switches = [];
        for (let index = 0; index < SWITCHES; index += 1) {
          const title = index % 2 === 0 ? LONG_SESSION : OTHER_SESSION;
          const { frames, blankFrames, overlaps } = await switchTo(
            session,
            title,
          );
          switches.push({
            title,
            frames,
            blankFrames,
            overlapFrames: overlaps.length,
          });
          check(overlaps.length === 0, `rows overlapped opening ${title}`, {
            switches,
            firstOverlap: overlaps[0],
          });
        }
        const warmBlankFrames = switches
          .slice(2)
          .reduce((total, entry) => total + entry.blankFrames, 0);
        check(warmBlankFrames === 0, "revisited sessions painted blank", {
          switches,
        });
        return { switches };
      },
    ],
    [
      "scrolling up never paints overlapping rows",
      async ({ session }) => {
        await switchTo(session, LONG_SESSION);
        await session.run(() => window.__paintSampler.start(0));
        await wheelToTop(session);
        const { frames, overlaps } = await session.run(() =>
          window.__paintSampler.stop(),
        );
        check(overlaps.length === 0, "rows overlapped while scrolling up", {
          frames,
          overlapFrames: overlaps.length,
          firstOverlap: overlaps[0],
        });
        return { frames, overlapFrames: overlaps.length };
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
