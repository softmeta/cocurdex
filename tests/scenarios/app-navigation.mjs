import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clickByRole, clickSelector, waitForRole } from "./lib/locate.mjs";
import {
  openNote,
  openSettingsSection,
  showPanelView,
  translate,
} from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const NOTE_TITLE = "Checkout spec";
const ISSUE_TITLE = "Checkout fails for some carts";
const HISTORY = "fieldset[data-history-index]";

const args = readScenarioArgs();

async function historyState(session) {
  return session.run((selector) => {
    const group = document.querySelector(selector);
    return {
      index: Number(group?.dataset.historyIndex ?? -1),
      length: Number(group?.dataset.historyLength ?? 0),
    };
  }, HISTORY);
}

async function waitForHistory(session, predicate, label) {
  const deadline = Date.now() + UI_TIMEOUT_MS;
  let state = await historyState(session);
  while (Date.now() < deadline) {
    if (predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
    state = await historyState(session);
  }
  throw new Error(`${label}: ${JSON.stringify(state)}`);
}

async function recordStep(session, action, label) {
  const before = await historyState(session);
  await action();
  return waitForHistory(
    session,
    (state) =>
      state.index === before.index + 1 && state.index === state.length - 1,
    label,
  );
}

async function waitForSelector(session, selector, present = true) {
  await session.waitUntil(
    ({ selector, present }) =>
      Boolean(document.querySelector(selector)?.getClientRects().length) ===
      present,
    { selector, present },
    UI_TIMEOUT_MS,
  );
}

async function activeSessionId(session) {
  return session.run(
    () =>
      document.querySelector("[data-session-id][data-active]")?.dataset
        .sessionId ?? null,
  );
}

async function pressNavigationKey(session, direction) {
  const isMac = await session.run(() => /Mac/.test(navigator.platform));
  const keys = {
    mac: {
      back: { key: "[", code: "BracketLeft", windowsVirtualKeyCode: 219 },
      forward: { key: "]", code: "BracketRight", windowsVirtualKeyCode: 221 },
    },
    other: {
      back: { key: "ArrowLeft", code: "ArrowLeft", windowsVirtualKeyCode: 37 },
      forward: {
        key: "ArrowRight",
        code: "ArrowRight",
        windowsVirtualKeyCode: 39,
      },
    },
  };
  const key = keys[isMac ? "mac" : "other"][direction];
  const modifiers = isMac ? 4 : 1;
  for (const type of ["rawKeyDown", "keyUp"]) {
    await session.send("Input.dispatchKeyEvent", { type, modifiers, ...key });
  }
}

async function pressMouseBack(session) {
  for (const type of ["mousePressed", "mouseReleased"]) {
    await session.send("Input.dispatchMouseEvent", {
      type,
      x: 400,
      y: 300,
      button: "back",
      clickCount: 1,
    });
  }
}

runScenario("app-navigation", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    await showPanelView(session, "notes");
    await waitForHistory(session, (state) => state.length > 0, "no history");
    return {};
  },
  steps: [
    [
      "opening a note, an issue, and a session records each place",
      async (context) => {
        const { session } = context;
        const note = await recordStep(
          session,
          () => openNote(session, NOTE_TITLE),
          "note not recorded",
        );
        const board = await recordStep(
          session,
          () => showPanelView(session, "issues"),
          "issues board not recorded",
        );
        const card = '[data-issue-id] [role="button"]';
        await waitForSelector(session, card);
        const issueId = await session.run(
          (title) =>
            [...document.querySelectorAll("[data-issue-id]")].find((element) =>
              element.textContent.includes(title),
            )?.dataset.issueId,
          ISSUE_TITLE,
        );
        check(Boolean(issueId), "fixture issue card missing");
        const issue = await recordStep(
          session,
          () =>
            clickSelector(
              session,
              `div[data-issue-id="${issueId}"] [role="button"]`,
              { fromLeft: 24 },
            ),
          "issue detail not recorded",
        );
        const sessionBefore = await activeSessionId(session);
        const otherSession = await session.run(
          (current) =>
            [...document.querySelectorAll("button[data-session-id]")].find(
              (element) => element.dataset.sessionId !== current,
            )?.dataset.sessionId,
          sessionBefore,
        );
        check(Boolean(otherSession), "no other session to open");
        const switched = await recordStep(
          session,
          () =>
            clickSelector(session, `button[data-session-id="${otherSession}"]`),
          "session switch not recorded",
        );
        Object.assign(context, { issueId, sessionBefore });
        return {
          indexes: [note.index, board.index, issue.index, switched.index],
          issueId,
          sessionBefore,
          otherSession,
        };
      },
    ],
    [
      "Back returns to the issue and the previous session",
      async ({ session, issueId, sessionBefore }) => {
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "editor:actions.navigateBack"),
        });
        await waitForSelector(session, `article[data-issue-id="${issueId}"]`);
        await session.waitUntil(
          (expected) =>
            (document.querySelector("[data-session-id][data-active]")?.dataset
              .sessionId ?? null) === expected,
          sessionBefore,
          UI_TIMEOUT_MS,
        );
        return {};
      },
    ],
    [
      "the keyboard shortcut goes back to the issues board",
      async ({ session, issueId }) => {
        await pressNavigationKey(session, "back");
        await waitForSelector(
          session,
          `article[data-issue-id="${issueId}"]`,
          false,
        );
        await waitForSelector(session, `div[data-issue-id="${issueId}"]`);
        return {};
      },
    ],
    [
      "the mouse back button returns to the note",
      async ({ session }) => {
        await pressMouseBack(session);
        await waitForSelector(session, "[data-note-id][data-active]");
        const title = await session.run(
          () =>
            document.querySelector("[data-note-id][data-active]")?.textContent,
        );
        check(title?.includes(NOTE_TITLE), "wrong note restored", { title });
        return {};
      },
    ],
    [
      "Forward goes to the issues board again",
      async ({ session, issueId }) => {
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "editor:actions.navigateForward"),
        });
        await waitForSelector(session, `div[data-issue-id="${issueId}"]`);
        return {};
      },
    ],
    [
      "Settings is one stop: Back leaves it, Forward reopens the last section",
      async ({ session, issueId }) => {
        const before = await recordStep(
          session,
          () => openSettingsSection(session, "general"),
          "settings not recorded",
        );
        await openSettingsSection(session, "appearance");
        await pressNavigationKey(session, "back");
        await waitForSelector(session, `div[data-issue-id="${issueId}"]`);
        const after = await historyState(session);
        check(
          after.index === before.index - 1 && after.length === before.length,
          "settings sections were recorded as separate stops",
          { before, after },
        );
        await pressNavigationKey(session, "forward");
        await waitForRole(
          session,
          {
            role: "heading",
            name: await translate(session, "settings:sections.appearance"),
          },
          UI_TIMEOUT_MS,
        );
        await pressNavigationKey(session, "back");
        await waitForSelector(session, `div[data-issue-id="${issueId}"]`);
        return { before, after };
      },
    ],
    [
      "the fullscreen panel keeps Back and Forward next to its view tabs",
      async ({ session }) => {
        const enter = await translate(
          session,
          "editor:actions.enterEditorFullscreen",
        );
        await clickByRole(session, { role: "button", name: enter });
        const exit = await translate(
          session,
          "editor:actions.exitEditorFullscreen",
        );
        await waitForRole(
          session,
          { role: "button", name: exit },
          UI_TIMEOUT_MS,
        );
        const backName = await translate(
          session,
          "editor:actions.navigateBack",
        );
        const [back] = await waitForRole(
          session,
          { role: "button", name: backName },
          UI_TIMEOUT_MS,
        );
        const tabsLeft = await session.run(
          () =>
            document
              .querySelector('[data-testid="editor-panel-view-switcher"]')
              ?.querySelector('[role="group"]')
              ?.getBoundingClientRect().left,
        );
        const backLeft = await session.run(
          (name) =>
            [...document.querySelectorAll("button")]
              .find(
                (button) =>
                  button.getAttribute("aria-label") === name &&
                  button.getClientRects().length > 0,
              )
              ?.getBoundingClientRect().left,
          backName,
        );
        check(
          typeof backLeft === "number" && backLeft < tabsLeft,
          "Back is not before the view tabs",
          { backLeft, tabsLeft, back },
        );
        await clickByRole(session, { role: "button", name: backName });
        await waitForSelector(session, "[data-note-id][data-active]");
        await clickByRole(session, { role: "button", name: exit });
        await waitForRole(
          session,
          { role: "button", name: enter },
          UI_TIMEOUT_MS,
        );
        return { backLeft, tabsLeft };
      },
    ],
    [
      "renderer has no errors",
      async ({ session }) => {
        const errors = await session.run(() =>
          window.__scenario.errors.filter((error) => error.level !== "network"),
        );
        check(errors.length === 0, "renderer errors", errors);
        return {};
      },
    ],
  ],
  teardown: async () => ({}),
});
