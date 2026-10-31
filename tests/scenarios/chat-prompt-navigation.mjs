import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clickByRole } from "./lib/locate.mjs";
import { translate } from "./lib/navigate.mjs";

const SESSION_ROW = /^Checkout flow diagrams\s+(?![(（])/;
const TARGET_PROMPT = 4;
const TARGET_ROW = TARGET_PROMPT - 1;
const SAMPLE_MS = 2_000;
const UI_TIMEOUT_MS = 30_000;

const args = readScenarioArgs();

function findViewport() {
  window.__navViewport = [
    ...document.querySelectorAll("[data-slot=scroll-area-viewport]"),
  ].find((node) => node.querySelector("[data-testid=chat-timeline]"));
  return Boolean(window.__navViewport?.scrollHeight > 4000);
}

function recordTargetFrames(rowIndex) {
  const viewport = window.__navViewport;
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:-10px;top:0;width:1px;height:1px;pointer-events:none";
  document.body.append(probe);
  const frames = [];
  let observer = null;
  let active = true;
  const sample = () => {
    const target = viewport.querySelector(
      `[data-testid=chat-timeline] > [data-index="${rowIndex}"]`,
    );
    frames.push({
      at: Math.round(performance.now()),
      scrollTop: Math.round(viewport.scrollTop),
      targetTop: target
        ? Math.round(
            target.getBoundingClientRect().top -
              viewport.getBoundingClientRect().top,
          )
        : null,
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
  window.__stopTargetFrames = () => {
    active = false;
    probe.remove();
    return frames;
  };
}

runScenario("chat-prompt-navigation", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    const [expandLabel, promptLabel] = await Promise.all([
      translate(session, "agent:navigation.expand"),
      translate(session, "agent:navigation.jumpToPrompt", {
        index: String(TARGET_PROMPT),
      }),
    ]);
    await clickByRole(
      session,
      { role: "button", name: SESSION_ROW },
      UI_TIMEOUT_MS,
    );
    await session.waitUntil(findViewport, null, UI_TIMEOUT_MS);
    return { expandLabel, promptLabel };
  },
  steps: [
    [
      "the target prompt holds its place while earlier diagrams render",
      async ({ session, expandLabel, promptLabel }) => {
        await clickByRole(
          session,
          { role: "button", name: expandLabel },
          UI_TIMEOUT_MS,
        );
        await session.run(recordTargetFrames, TARGET_ROW);
        await clickByRole(
          session,
          { role: "button", name: promptLabel },
          UI_TIMEOUT_MS,
        );
        await session.run(
          (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
          SAMPLE_MS,
        );
        const frames = await session.run(() => window.__stopTargetFrames());
        const landed = frames.findIndex((frame) => frame.targetTop !== null);
        const after = frames.slice(landed);
        const positions = [...new Set(after.map((frame) => frame.targetTop))];
        check(
          landed >= 0 && positions.length === 1,
          "target prompt moved after the jump",
          { positions, frames: after },
        );
        return { frames: after.length, targetTop: positions[0] };
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
