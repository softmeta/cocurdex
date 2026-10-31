import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import { waitForNoRole } from "./lib/locate.mjs";
import {
  openEditorPanel,
  openExecutionTree,
  translate,
} from "./lib/navigate.mjs";

const TEAM_SESSION_ID = "fixture-session-checkout-team";
const TEAM_SESSION_TITLE = "Coordinate checkout review";
const MISSING_FILE_NAME =
  "sqlite-checkout-session-repository-with-retries-and-audit-trail.ts";
const PI_AGENT_LABEL = "Pi";
const SESSION_HEADER_HEIGHT_PX = 28;
const UI_TIMEOUT_MS = 30_000;

const args = readScenarioArgs();

function rowSelector(key) {
  return `[role="dialog"] [data-execution-row="${key}"]`;
}

function readRow(session, key) {
  return session.run((selector) => {
    const row = document.querySelector(selector);
    if (!row) return null;
    return {
      text: row.innerText.replace(/\s+/g, " ").trim(),
      expanded:
        row.querySelector("[aria-expanded]")?.getAttribute("aria-expanded") ??
        null,
      expandControls: row.querySelectorAll("[aria-expanded]").length,
      icons: row.querySelectorAll("svg, img").length,
    };
  }, rowSelector(key));
}

function waitForRow(session, key, present = true) {
  return session.waitUntil(
    ({ selector, present }) =>
      Boolean(document.querySelector(selector)) === present,
    { selector: rowSelector(key), present },
    UI_TIMEOUT_MS,
  );
}

function toggleRow(session, key) {
  return session.run((selector) => {
    const toggle = document.querySelector(`${selector} button[aria-expanded]`);
    toggle?.click();
    return Boolean(toggle);
  }, rowSelector(key));
}

function readDialogTop(session) {
  return session.run(
    () => document.querySelector('[role="dialog"]').getBoundingClientRect().top,
  );
}

function toolKey(node) {
  return `tool:${node.toolCall.id}`;
}

function describeTree(tree) {
  const runs = tree.root.runs;
  const latest = runs.at(-1);
  const teammates = [...tree.root.children].sort((left, right) =>
    left.session.title.localeCompare(right.session.title),
  );
  return {
    earlierRun: runs[0],
    emptyRun: runs.find((run) => run.toolCalls.length === 0),
    latestRun: latest,
    healthyCall: latest.toolCalls.find(
      (node) => node.toolCall.status === "completed",
    ),
    failedCall: latest.toolCalls.find(
      (node) => node.toolCall.status === "failed",
    ),
    teammates: teammates.map((child) => ({
      key: `session:${child.session.id}`,
      calls: child.runs.flatMap((run) => run.toolCalls),
    })),
  };
}

runScenario("execution-tree", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  async setup({ session }) {
    const tree = await daemonRequest(session, "session.executionTree", {
      sessionId: TEAM_SESSION_ID,
    });
    check(Boolean(tree), "fixture team session missing");
    const shape = describeTree(tree);
    check(
      shape.teammates.length === 2 && shape.failedCall && shape.emptyRun,
      "fixture team session has an unexpected shape",
      shape,
    );
    await openExecutionTree(session, TEAM_SESSION_TITLE);
    await waitForRow(session, toolKey(shape.failedCall));
    return { shape, rootKey: `session:${TEAM_SESSION_ID}` };
  },
  steps: [
    [
      "long-labels-stay-inside-dialog",
      async ({ session, shape }) => {
        const label = await readRow(session, toolKey(shape.failedCall));
        check(
          label.text.includes(MISSING_FILE_NAME),
          "tool call label misses its path",
          label,
        );
        const layout = await session.run(() => {
          const dialog = document.querySelector('[role="dialog"]');
          const bounds = dialog.getBoundingClientRect();
          const toggle = dialog.querySelector('[role="switch"]');
          const firstRow = dialog
            .querySelector("[data-execution-row]")
            .getBoundingClientRect();
          const overflowing = [...dialog.querySelectorAll("li button")]
            .filter(
              (button) =>
                button.getBoundingClientRect().right > bounds.right + 0.5,
            )
            .map((button) => button.innerText.trim());
          const toggleRect = toggle?.getBoundingClientRect();
          return {
            overflowing,
            toggleInside: Boolean(
              toggleRect &&
                toggleRect.left >= bounds.left &&
                toggleRect.right <= bounds.right &&
                toggleRect.bottom <= firstRow.top,
            ),
          };
        });
        check(
          layout.overflowing.length === 0,
          "rows overflow the dialog",
          layout,
        );
        check(layout.toggleInside, "issues-only toggle is off-screen", layout);
        return layout;
      },
    ],
    [
      "session-row-shows-agent-icon-and-name",
      async ({ session, rootKey }) => {
        const row = await readRow(session, rootKey);
        check(
          row.text.endsWith(PI_AGENT_LABEL),
          "agent display name missing",
          row,
        );
        check(row.icons >= 2, "agent icon missing", row);
        return row;
      },
    ],
    [
      "earlier-run-collapsed-with-summary",
      async ({ session, shape }) => {
        const { earlierRun } = shape;
        const runKey = `run:${earlierRun.run.id}`;
        const [firstCall] = earlierRun.toolCalls;
        const row = await readRow(session, runKey);
        const summary = await translate(
          session,
          "sessions:executionTree.toolCount",
          { count: earlierRun.toolCalls.length },
        );
        check(row.expanded === "false", "earlier run expanded by default", row);
        check(row.text.includes(summary), "earlier run summary missing", row);
        check(
          !(await readRow(session, toolKey(firstCall))),
          "earlier run calls shown before expanding",
        );
        check(await toggleRow(session, runKey), "earlier run toggle missing");
        await waitForRow(session, toolKey(firstCall));
        return row;
      },
    ],
    [
      "failed-tool-output",
      async ({ session, shape }) => {
        check(
          await toggleRow(session, toolKey(shape.failedCall)),
          "failed tool call toggle missing",
        );
        await session.waitUntil(
          () => Boolean(document.querySelector('[role="dialog"] pre')),
          null,
          UI_TIMEOUT_MS,
        );
        const output = await session.run(
          () => document.querySelector('[role="dialog"] pre').innerText,
        );
        check(
          output.includes(MISSING_FILE_NAME),
          "failed output does not name the missing file",
          output,
        );
        await toggleRow(session, toolKey(shape.failedCall));
        return { outputLines: output.split("\n").length };
      },
    ],
    [
      "empty-run-has-no-expand-control",
      async ({ session, shape }) => {
        const row = await readRow(session, `run:${shape.emptyRun.run.id}`);
        check(Boolean(row), "empty run row missing");
        check(row.expandControls === 0, "empty run is expandable", row);
        return row;
      },
    ],
    [
      "subagents-folded-with-summary",
      async ({ session, shape }) => {
        const rows = [];
        for (const teammate of shape.teammates) {
          const row = await readRow(session, teammate.key);
          const [toolCount, failedCount] = await Promise.all([
            translate(session, "sessions:executionTree.toolCount", {
              count: teammate.calls.length,
            }),
            translate(session, "sessions:executionTree.failedCount", {
              count: 1,
            }),
          ]);
          check(Boolean(row), "subagent row missing", teammate.key);
          check(row.expanded === "false", "subagent expanded by default", row);
          check(
            row.text.includes(toolCount) && row.text.includes(failedCount),
            "subagent summary missing",
            row,
          );
          check(
            !(await readRow(session, toolKey(teammate.calls[0]))),
            "subagent calls shown before expanding",
          );
          rows.push(row.text);
        }
        return { rows };
      },
    ],
    [
      "sticky-session-headers",
      async ({ session, shape, rootKey }) => {
        const [first, second] = shape.teammates;
        check(await toggleRow(session, first.key), "subagent toggle missing");
        const lastCallKey = toolKey(first.calls.at(-1));
        await waitForRow(session, lastCallKey);
        const layout = await session.run(
          async ({ rootSelector, workerSelector, lastSelector }) => {
            const list = document.querySelector('[role="dialog"] ul');
            const lastCall = document.querySelector(lastSelector);
            list.scrollTop +=
              lastCall.getBoundingClientRect().bottom -
              list.getBoundingClientRect().bottom;
            await new Promise((resolve) => requestAnimationFrame(resolve));
            const listTop = list.getBoundingClientRect().top;
            const top = (selector) =>
              document.querySelector(selector).getBoundingClientRect().top -
              listTop;
            const result = {
              scrolled: list.scrollTop,
              root: top(rootSelector),
              worker: top(workerSelector),
            };
            list.scrollTop = 0;
            return result;
          },
          {
            rootSelector: rowSelector(rootKey),
            workerSelector: rowSelector(first.key),
            lastSelector: rowSelector(lastCallKey),
          },
        );
        check(layout.scrolled > 0, "list did not scroll", layout);
        check(Math.abs(layout.root) < 1, "root header not pinned", layout);
        check(
          Math.abs(layout.worker - SESSION_HEADER_HEIGHT_PX) < 1,
          "subagent header not pinned below root",
          layout,
        );
        await toggleRow(session, first.key);
        await toggleRow(session, second.key);
        await waitForRow(session, toolKey(second.calls.at(-1)));
        const overlap = await session.run(
          async ({ rootSelector, workerSelector }) => {
            const list = document.querySelector('[role="dialog"] ul');
            list.scrollTop +=
              document.querySelector(workerSelector).getBoundingClientRect()
                .top - list.getBoundingClientRect().top;
            await new Promise((resolve) => requestAnimationFrame(resolve));
            const rootHeader = document.querySelector(rootSelector);
            const rect = rootHeader.getBoundingClientRect();
            const hit = document.elementFromPoint(
              rect.left + rect.width / 2,
              rect.top + rect.height / 2,
            );
            const result = {
              scrolled: list.scrollTop,
              rootOnTop: rootHeader.contains(hit),
            };
            list.scrollTop = 0;
            return result;
          },
          {
            rootSelector: rowSelector(rootKey),
            workerSelector: rowSelector(second.key),
          },
        );
        check(overlap.scrolled > 0, "list did not scroll", overlap);
        check(
          overlap.rootOnTop,
          "a nested header covers the root header",
          overlap,
        );
        await toggleRow(session, second.key);
        return { ...layout, ...overlap };
      },
    ],
    [
      "issues-only-filter",
      async ({ session, shape }) => {
        const { healthyCall, failedCall } = shape;
        const topBefore = await readDialogTop(session);
        const clicked = await session.run(() => {
          const toggle = document.querySelector(
            '[role="dialog"] [role="switch"]',
          );
          toggle?.click();
          return Boolean(toggle);
        });
        check(clicked, "issues-only switch missing");
        await waitForRow(session, toolKey(healthyCall), false);
        check(
          Boolean(await readRow(session, toolKey(failedCall))),
          "issues-only dropped the failed call",
        );
        const topAfter = await readDialogTop(session);
        check(
          Math.abs(topAfter - topBefore) < 1,
          "dialog moved when filtering",
          { topBefore, topAfter },
        );
        return { topBefore, topAfter };
      },
    ],
    [
      "collapse-run-while-filtering",
      async ({ session, shape }) => {
        const { latestRun, failedCall } = shape;
        check(
          await toggleRow(session, `run:${latestRun.run.id}`),
          "latest run toggle missing",
        );
        await waitForRow(session, toolKey(failedCall), false);
        return {};
      },
    ],
    [
      "no-runtime-errors",
      async ({ session }) => {
        const errors = await session.run(() => window.__scenario.errors);
        check(errors.length === 0, "renderer errors", errors);
        return {};
      },
    ],
    [
      "right-panel-close-button",
      async ({ session }) => {
        await session.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        });
        await session.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        });
        await waitForNoRole(session, { role: "dialog" }, UI_TIMEOUT_MS);
        const [open, close] = await Promise.all([
          translate(session, "editor:actions.openEditorPanel"),
          translate(session, "editor:actions.closeEditorPanel"),
        ]);
        await openEditorPanel(session);
        await session.waitUntil(
          (label) =>
            [
              ...document.querySelectorAll(
                `[aria-label="${CSS.escape(label)}"]`,
              ),
            ].some((button) => !button.closest("header")),
          close,
          UI_TIMEOUT_MS,
        );
        const clicked = await session.run((label) => {
          const button = [
            ...document.querySelectorAll(`[aria-label="${CSS.escape(label)}"]`),
          ].find((candidate) => !candidate.closest("header"));
          button?.click();
          return Boolean(button);
        }, close);
        check(clicked, "right panel close button missing");
        await session.waitUntil(
          ({ open, close }) =>
            Boolean(
              document.querySelector(`[aria-label="${CSS.escape(open)}"]`),
            ) &&
            ![
              ...document.querySelectorAll(
                `[aria-label="${CSS.escape(close)}"]`,
              ),
            ].some((button) => !button.closest("header")),
          { open, close },
          UI_TIMEOUT_MS,
        );
        return { closed: true };
      },
    ],
  ],
  teardown: async () => ({}),
});
