import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const TOOLTIP_DELAY_MS = 900;
const MULTI_FOLDER_WORKSPACE_ID = "fixture-acme-suite";
const PREVIEW_EARLY_MS = 150;
const UNPROMPTED_PREVIEW_WAIT_MS = 800;
const MAX_ARROW_PRESSES = 6;

const PREVIEW_GAP = 4;

const args = readScenarioArgs();
if (args.port) {
  console.error(
    "workspace-picker runs only on an isolated instance; omit --port",
  );
  process.exit(2);
}

async function workspaceTrigger(session) {
  const label = await translate(session, "sessions:workspace.workspace");
  return session.run((label) => {
    const trigger = [
      ...document.querySelectorAll('[data-slot="combobox-trigger"]'),
    ].find((element) => element.getAttribute("aria-label") === label);
    if (!trigger) throw new Error(`No workspace trigger labelled ${label}`);
    const rect = trigger.getBoundingClientRect();
    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      insideTooltip: Boolean(trigger.closest('[data-slot="tooltip-trigger"]')),
    };
  }, label);
}

function previewOpen(session) {
  return session.run(() =>
    Boolean(document.querySelector('[data-slot="tooltip-content"][data-open]')),
  );
}

async function pressKey(session, key, keyCode) {
  for (const type of ["keyDown", "keyUp"]) {
    await session.send("Input.dispatchKeyEvent", {
      type,
      key,
      code: key,
      windowsVirtualKeyCode: keyCode,
    });
  }
}

const POINTER_STEPS = 4;

async function glidePointer(session, from, to) {
  for (let step = 1; step <= POINTER_STEPS; step += 1) {
    const progress = step / POINTER_STEPS;
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: from.x + (to.x - from.x) * progress,
      y: from.y + (to.y - from.y) * progress,
    });
  }
}

function popupSettled() {
  const popup = document.querySelector('[data-slot="combobox-content"]');
  return (
    Boolean(popup) &&
    !popup.hasAttribute("data-starting-style") &&
    popup.getAnimations({ subtree: true }).length === 0
  );
}

function isHighlighted(text) {
  return (
    document
      .querySelector('[data-slot="combobox-item"][data-highlighted]')
      ?.innerText.trim() === text
  );
}

async function clickAt(session, point) {
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  for (const [type, buttons] of [
    ["mousePressed", 1],
    ["mouseReleased", 0],
  ]) {
    await session.send("Input.dispatchMouseEvent", {
      type,
      button: "left",
      buttons,
      clickCount: 1,
      x: point.x,
      y: point.y,
    });
  }
}

runScenario("workspace-picker", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session, fixtureDb }) => {
    check(fixtureDb, "fixture database was not installed");
    const suite = fixtureDb.installedWorkspaces.find(
      (workspace) => workspace.id === MULTI_FOLDER_WORKSPACE_ID,
    );
    check(suite, "fixture database lacks the multi-folder workspace");
    const newSessionLabel = await translate(
      session,
      "sessions:sidebar.newSession",
    );
    await session.waitUntil(
      (label) => Boolean(window.__scenario.byLabel(label)),
      newSessionLabel,
      UI_TIMEOUT_MS,
    );
    await session.run((label) => {
      window.__scenario.byLabel(label).click();
      return true;
    }, newSessionLabel);
    await session.waitUntil(
      () => Boolean(document.querySelector('[data-slot="combobox-trigger"]')),
      null,
      UI_TIMEOUT_MS,
    );
    return {
      workspaceName: suite.name,
      folderNames: suite.rootPaths.map((rootPath) => path.basename(rootPath)),
    };
  },
  steps: [
    [
      "hovering the picker shows no tooltip",
      async ({ session }) => {
        const trigger = await workspaceTrigger(session);
        check(
          !trigger.insideTooltip,
          "workspace picker is wrapped in a tooltip",
        );
        await session.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: trigger.x,
          y: trigger.y,
        });
        await delay(TOOLTIP_DELAY_MS);
        const tooltipOpen = await session.run(() =>
          Boolean(document.querySelector('[data-slot="tooltip-content"]')),
        );
        check(!tooltipOpen, "tooltip opened on the workspace picker");
        return {};
      },
    ],
    [
      "a multi-folder option stays one line and previews its folders on highlight",
      async ({ session, workspaceName, folderNames }) => {
        const trigger = await workspaceTrigger(session);
        await clickAt(session, trigger);
        await session.waitUntil(
          (name) =>
            [...document.querySelectorAll('[data-slot="combobox-item"]')].some(
              (item) => item.innerText.includes(name),
            ),
          workspaceName,
          UI_TIMEOUT_MS,
        );
        await session.waitUntil(popupSettled, null, UI_TIMEOUT_MS);
        const option = await session.run((name) => {
          const items = [
            ...document.querySelectorAll('[data-slot="combobox-item"]'),
          ];
          const item = items.find((element) =>
            element.innerText.includes(name),
          );
          const center = (element) => {
            const rect = element.getBoundingClientRect();
            return {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
            };
          };
          const reachable = (element) => {
            const { x, y } = center(element);
            return element.contains(document.elementFromPoint(x, y));
          };
          const other = items.find(
            (element) => element !== item && reachable(element),
          );
          return {
            text: item.innerText.trim(),
            point: center(item),
            otherPoint: center(other),
            otherText: other.innerText.trim(),
          };
        }, workspaceName);
        check(
          option.text === workspaceName,
          "multi-folder option is not a single line",
          option.text,
        );
        await session.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          ...option.otherPoint,
        });
        await session.waitUntil(isHighlighted, option.otherText, UI_TIMEOUT_MS);
        await session.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          ...option.point,
        });
        await delay(PREVIEW_EARLY_MS);
        check(
          !(await previewOpen(session)),
          "preview opened before the hover delay",
        );
        await session.waitUntil(
          () => {
            const panel = document.querySelector(
              '[data-slot="tooltip-content"][data-open]',
            );
            return Boolean(panel) && panel.getAnimations().length === 0;
          },
          null,
          UI_TIMEOUT_MS,
        );
        const labels = {
          primaryLabel: await translate(
            session,
            "sessions:workspace.rootsPrimary",
          ),
          additionalLabel: await translate(
            session,
            "sessions:workspace.rootsAdditional",
          ),
        };
        const preview = await session.run((labels) => {
          const panel = document.querySelector(
            '[data-slot="tooltip-content"][data-open]',
          );
          const popup = document.querySelector(
            '[data-slot="combobox-content"]',
          );
          return {
            lines: panel.innerText
              .split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
            ...labels,
            gap:
              panel.getBoundingClientRect().left -
              popup.getBoundingClientRect().right,
            surfaces: [panel, popup].map((element) => {
              const style = getComputedStyle(element);
              return [
                style.borderTopLeftRadius,
                style.boxShadow,
                style.backgroundColor,
              ].join(" | ");
            }),
            panelPadding: getComputedStyle(panel).padding,
          };
        }, labels);
        const [primaryName, ...additionalNames] = folderNames;
        const { lines } = preview;
        const primaryIndex = lines.indexOf(preview.primaryLabel);
        const additionalIndex = lines.indexOf(preview.additionalLabel);
        check(
          Math.abs(preview.gap - PREVIEW_GAP) <= 0.5,
          "preview does not sit the shared gap beside the popup",
          preview,
        );
        check(
          preview.surfaces[0] === preview.surfaces[1],
          "preview card surface differs from the popup",
          preview.surfaces,
        );
        check(
          lines[0] === preview.primaryLabel,
          "preview repeats the hovered workspace name",
          { lines, workspaceName },
        );
        check(
          primaryIndex >= 0 &&
            lines[primaryIndex + 1]?.startsWith(primaryName) &&
            additionalIndex > primaryIndex &&
            additionalNames.every((name, index) =>
              lines[additionalIndex + 1 + index]?.startsWith(name),
            ),
          "preview does not mark the primary folder and list the others",
          { lines, folderNames },
        );
        await glidePointer(session, option.point, option.otherPoint);
        await session.waitUntil(isHighlighted, option.otherText, UI_TIMEOUT_MS);
        await session.waitUntil(
          () =>
            !document.querySelector('[data-slot="tooltip-content"][data-open]'),
          null,
          UI_TIMEOUT_MS,
        );
        return { lines };
      },
    ],
    [
      "keyboard highlight previews a multi-folder option at once",
      async ({ session, workspaceName }) => {
        await pressKey(session, "Escape", 27);
        await session.waitUntil(
          () => !document.querySelector('[data-slot="combobox-item"]'),
          null,
          UI_TIMEOUT_MS,
        );
        const trigger = await workspaceTrigger(session);
        await clickAt(session, trigger);
        await session.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: trigger.x,
          y: trigger.y + 200,
        });
        await session.waitUntil(
          () => Boolean(document.querySelector('[data-slot="combobox-item"]')),
          null,
          UI_TIMEOUT_MS,
        );
        let highlighted = null;
        for (let press = 0; press < MAX_ARROW_PRESSES; press += 1) {
          await pressKey(session, "ArrowDown", 40);
          highlighted = await session.run(
            () =>
              document
                .querySelector('[data-slot="combobox-item"][data-highlighted]')
                ?.innerText.trim() ?? null,
          );
          if (highlighted === workspaceName) break;
        }
        check(
          highlighted === workspaceName,
          "arrow keys did not reach the multi-folder option",
          highlighted,
        );
        await delay(PREVIEW_EARLY_MS);
        check(
          await previewOpen(session),
          "keyboard highlight did not open the preview at once",
        );
        await pressKey(session, "Escape", 27);
        return {};
      },
    ],
    [
      "reopening with the multi-folder workspace selected shows no preview",
      async ({ session, workspaceName }) => {
        const trigger = await workspaceTrigger(session);
        await clickAt(session, trigger);
        await session.waitUntil(
          (name) =>
            [...document.querySelectorAll('[data-slot="combobox-item"]')].some(
              (item) => item.innerText.trim() === name,
            ),
          workspaceName,
          UI_TIMEOUT_MS,
        );
        await session.waitUntil(popupSettled, null, UI_TIMEOUT_MS);
        const option = await session.run((name) => {
          const item = [
            ...document.querySelectorAll('[data-slot="combobox-item"]'),
          ].find((element) => element.innerText.trim() === name);
          const rect = item.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        }, workspaceName);
        await clickAt(session, option);
        await session.waitUntil(
          () => !document.querySelector('[data-slot="combobox-item"]'),
          null,
          UI_TIMEOUT_MS,
        );
        const reopened = await workspaceTrigger(session);
        await clickAt(session, reopened);
        await session.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: reopened.x,
          y: reopened.y + 200,
        });
        await session.waitUntil(
          () =>
            Boolean(
              document.querySelector(
                '[data-slot="combobox-item"][data-selected]',
              ),
            ),
          null,
          UI_TIMEOUT_MS,
        );
        const selected = await session.run(
          () =>
            document
              .querySelector('[data-slot="combobox-item"][data-selected]')
              ?.innerText.trim() ?? null,
        );
        check(
          selected === workspaceName,
          "multi-folder workspace is not selected",
          selected,
        );
        await delay(UNPROMPTED_PREVIEW_WAIT_MS);
        check(
          !(await previewOpen(session)),
          "preview opened without hover or arrow keys",
        );
        await pressKey(session, "Escape", 27);
        return {};
      },
    ],
    [
      "the sidebar preview lists folders without repeating the name",
      async ({ session, workspaceName }) => {
        const row = await session.run((name) => {
          const button = [
            ...document.querySelectorAll(
              '[data-slot="sidebar-menu-item"] button',
            ),
          ].find((element) => element.innerText.trim() === name);
          if (!button) return null;
          const rect = button.getBoundingClientRect();
          return {
            x: rect.left + rect.width / 2,
            y: rect.top + rect.height / 2,
          };
        }, workspaceName);
        check(row, "sidebar lacks the multi-folder workspace row");
        await session.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          ...row,
        });
        await session.waitUntil(
          () =>
            Boolean(
              document.querySelector(
                '[data-slot="tooltip-content"][data-open]',
              ),
            ),
          null,
          UI_TIMEOUT_MS,
        );
        const primaryLabel = await translate(
          session,
          "sessions:workspace.rootsPrimary",
        );
        const preview = await session.run(
          (primaryLabel) => ({
            lines: document
              .querySelector('[data-slot="tooltip-content"][data-open]')
              .innerText.split("\n")
              .map((line) => line.trim())
              .filter(Boolean),
            primaryLabel,
          }),
          primaryLabel,
        );
        check(
          preview.lines[0] === preview.primaryLabel &&
            !preview.lines.includes(workspaceName),
          "sidebar preview repeats the workspace name",
          preview,
        );
        await session.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: row.x + 600,
          y: row.y,
        });
        return { lines: preview.lines };
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
