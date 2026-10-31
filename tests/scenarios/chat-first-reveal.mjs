import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clickByRole, waitForRole } from "./lib/locate.mjs";
import { translate } from "./lib/navigate.mjs";

const SESSION_TITLE = "Draft release notes";
const HEADING = "Acme Shop 0.4.0";
const DIAGRAM_NAME_KEY = "common:mermaid.title";
const UI_TIMEOUT_MS = 30_000;
const SETTLE_FRAMES = 30;

const SESSION_ROW = new RegExp(`^${SESSION_TITLE}\\s+(?![(（])`);

const args = readScenarioArgs();

async function openSession(session) {
  await clickByRole(
    session,
    { role: "button", name: SESSION_ROW },
    UI_TIMEOUT_MS,
  );
}

function startFrameRecorder({ heading, diagramName, settleFrames }) {
  const effectiveOpacity = (node) => {
    let opacity = 1;
    for (let el = node; el; el = el.parentElement) {
      opacity *= Number(getComputedStyle(el).opacity);
    }
    return opacity;
  };
  const sample = () => {
    const title = [...document.querySelectorAll("h2")].find(
      (el) => el.textContent.trim() === heading,
    );
    if (!title) return null;
    const column = title.closest("[data-message-id]") ?? title.parentElement;
    const diagram = document.querySelector(
      `[role="img"][aria-label="${diagramName}"]`,
    );
    return {
      visible: effectiveOpacity(title) > 0,
      headingTop: Math.round(title.getBoundingClientRect().top),
      contentHeight: Math.round(column.getBoundingClientRect().height),
      diagram: Boolean(diagram),
    };
  };
  const recorder = { frames: [], done: false };
  window.__chatRevealRecorder = recorder;
  let stableFrames = 0;
  const tick = () => {
    const frame = sample();
    if (frame) {
      const previous = recorder.frames.at(-1);
      const same =
        previous && JSON.stringify(previous) === JSON.stringify(frame);
      stableFrames =
        same && frame.visible && frame.diagram ? stableFrames + 1 : 0;
      recorder.frames.push(frame);
    }
    if (stableFrames >= settleFrames) {
      recorder.done = true;
      return;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

runScenario("chat-first-reveal", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    await openSession(session);
    await waitForRole(
      session,
      { role: "image", name: await translate(session, DIAGRAM_NAME_KEY) },
      UI_TIMEOUT_MS,
    );
    await session.reload();
    await waitForRole(
      session,
      { role: "button", name: SESSION_ROW },
      UI_TIMEOUT_MS,
    );
    return {};
  },
  steps: [
    [
      "a cold first open reveals the session in its final layout",
      async ({ session }) => {
        await session.run(startFrameRecorder, {
          heading: HEADING,
          diagramName: await translate(session, DIAGRAM_NAME_KEY),
          settleFrames: SETTLE_FRAMES,
        });
        await openSession(session);
        await session.waitUntil(
          () => window.__chatRevealRecorder.done,
          null,
          UI_TIMEOUT_MS,
        );
        const frames = await session.run(
          () => window.__chatRevealRecorder.frames,
        );
        const visible = frames.filter((frame) => frame.visible);
        const [firstVisible] = visible;
        const final = frames.at(-1);
        const report = {
          hiddenFrames: frames.length - visible.length,
          firstVisible,
          final,
        };
        check(final.diagram, "diagram never rendered", report);
        check(
          JSON.stringify(firstVisible) === JSON.stringify(final),
          "content changed after it became visible",
          report,
        );
        return report;
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
