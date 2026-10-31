import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clickByRole, waitForNoRole, waitForRole } from "./lib/locate.mjs";
import { translate } from "./lib/navigate.mjs";

const PINNED_SESSION = "Add percentage discount codes";
const LISTED_SESSION = "Store cart totals in cents";
const SESSION_WORKSPACE = { id: "fixture-acme-shop", name: "acme-shop" };
const OTHER_WORKSPACE = { id: "fixture-acme-suite", name: "acme-suite" };
const UI_TIMEOUT_MS = 30_000;
const POINTER_PARK = { x: 900, y: 300 };

const args = readScenarioArgs();

function readComposerWorkspaceId() {
  return (
    document.querySelector("[data-workspace-id]")?.dataset.workspaceId ?? null
  );
}

async function openSession(session, title) {
  await clickByRole(
    session,
    { role: "button", name: new RegExp(`^${title}\\s+(?![(（])`) },
    UI_TIMEOUT_MS,
  );
  await session.waitUntil(
    (title) =>
      Boolean(document.querySelector("[data-workspace-id]")) &&
      document.body.innerText.includes(title),
    title,
    UI_TIMEOUT_MS,
  );
}

async function setExpanded(session, workspace, expanded) {
  await clickByRole(session, { role: "button", name: workspace.name });
  await session.waitUntil(
    ({ name, expanded }) =>
      [...document.querySelectorAll("button[aria-expanded]")].some(
        (button) =>
          button.textContent === name &&
          button.getAttribute("aria-expanded") === String(expanded),
      ),
    { name: workspace.name, expanded },
    UI_TIMEOUT_MS,
  );
}

async function readRowFill(session, workspace) {
  const [row] = await waitForRole(session, {
    role: "button",
    name: new RegExp(`^${workspace.name} `),
  });
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...POINTER_PARK,
  });
  await session.send("DOM.getDocument", { depth: 0 });
  const { object } = await session.send("DOM.resolveNode", {
    backendNodeId: row.backendNodeId,
  });
  const { result } = await session.send("Runtime.callFunctionOn", {
    objectId: object.objectId,
    returnByValue: true,
    awaitPromise: true,
    functionDeclaration: `async function () {
      await Promise.all(this.getAnimations().map((animation) => animation.finished));
      return getComputedStyle(this).backgroundColor;
    }`,
  });
  return result.value;
}

async function collapsedFill(session) {
  await setExpanded(session, SESSION_WORKSPACE, false);
  const active = await readRowFill(session, SESSION_WORKSPACE);
  const idle = await readRowFill(session, OTHER_WORKSPACE);
  await setExpanded(session, SESSION_WORKSPACE, true);
  const expanded = await readRowFill(session, SESSION_WORKSPACE);
  return { active, expanded, idle };
}

async function scrollAreaOf(session, backendNodeId) {
  await session.send("DOM.getDocument", { depth: 0 });
  const { object } = await session.send("DOM.resolveNode", { backendNodeId });
  const { result } = await session.send("Runtime.callFunctionOn", {
    objectId: object.objectId,
    returnByValue: true,
    functionDeclaration: `function () {
      let node = this.parentElement;
      while (node && !/auto|scroll/.test(getComputedStyle(node).overflowY)) {
        node = node.parentElement;
      }
      const row = this.getBoundingClientRect();
      const area = node.getBoundingClientRect();
      return {
        row: { left: row.left, top: row.top, bottom: row.bottom },
        area: { top: area.top, bottom: area.bottom },
      };
    }`,
  });
  return result.value;
}

function readDragOverlay() {
  const overlay = document.querySelector(
    '[data-testid="workspace-drag-overlay"]',
  );
  if (!overlay) return null;
  const { left, top, bottom } = overlay.getBoundingClientRect();
  return { left, top, bottom };
}

async function flingWorkspace(session, workspace) {
  const [row] = await waitForRole(session, {
    role: "button",
    name: new RegExp(`^${workspace.name} `),
  });
  const { row: rect, area } = await scrollAreaOf(session, row.backendNodeId);
  const start = { x: rect.left + 40, y: (rect.top + rect.bottom) / 2 };
  const mouse = (type, point) =>
    session.send("Input.dispatchMouseEvent", {
      type,
      button: "left",
      buttons: type === "mouseReleased" ? 0 : 1,
      clickCount: 1,
      ...point,
    });
  await mouse("mousePressed", start);
  for (let step = 1; step <= 10; step += 1) {
    await mouse("mouseMoved", {
      x: start.x + step * 60,
      y: Math.max(1, start.y - step * 60),
    });
  }
  await session.waitUntil(readDragOverlay, null, UI_TIMEOUT_MS);
  const overlay = await session.run(readDragOverlay);
  await session.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await mouse("mouseReleased", start);
  await session.waitUntil(
    () => !document.querySelector('[data-testid="workspace-drag-overlay"]'),
    null,
    UI_TIMEOUT_MS,
  );
  return { overlay, row: rect, area };
}

runScenario("workspace-sidebar", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    await openSession(session, PINNED_SESSION);
    return {};
  },
  steps: [
    [
      "toggling another workspace keeps the open session's workspace",
      async ({ session }) => {
        await setExpanded(session, OTHER_WORKSPACE, false);
        await setExpanded(session, OTHER_WORKSPACE, true);
        const composerWorkspaceId = await session.run(readComposerWorkspaceId);
        check(
          composerWorkspaceId === SESSION_WORKSPACE.id,
          "composer shows another workspace",
          { composerWorkspaceId },
        );
        return { composerWorkspaceId };
      },
    ],
    [
      "a pinned active session leaves its collapsed workspace unfilled",
      async ({ session }) => {
        const fill = await collapsedFill(session);
        check(
          fill.active === fill.idle,
          "workspace duplicates selection",
          fill,
        );
        return fill;
      },
    ],
    [
      "a collapsed workspace hiding the active session carries the fill",
      async ({ session }) => {
        await openSession(session, LISTED_SESSION);
        const fill = await collapsedFill(session);
        check(fill.active !== fill.idle, "hidden selection has no fill", fill);
        check(
          fill.expanded === fill.idle,
          "expanded workspace is filled",
          fill,
        );
        return fill;
      },
    ],
    [
      "a dragged workspace stays in the list column and scroll area",
      async ({ session }) => {
        const drag = await flingWorkspace(session, OTHER_WORKSPACE);
        check(
          Math.abs(drag.overlay.left - drag.row.left) < 2,
          "overlay left the list column",
          drag,
        );
        check(
          drag.overlay.top >= drag.area.top - 1,
          "overlay left the scroll area",
          drag,
        );
        return drag;
      },
    ],
    [
      "removing a workspace from its context menu asks first",
      async ({ session }) => {
        await clickByRole(
          session,
          { role: "button", name: new RegExp(`^${OTHER_WORKSPACE.name} `) },
          UI_TIMEOUT_MS,
          "right",
        );
        await clickByRole(
          session,
          {
            role: "menuitem",
            name: await translate(session, "sessions:sidebar.removeWorkspace"),
          },
          UI_TIMEOUT_MS,
        );
        const title = await translate(
          session,
          "sessions:workspace.editRemoveTitle",
          {
            name: OTHER_WORKSPACE.name,
          },
        );
        await waitForRole(
          session,
          { role: "dialog", name: title },
          UI_TIMEOUT_MS,
        );
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "sessions:workspace.editCancel"),
        });
        await waitForNoRole(session, { role: "dialog" }, UI_TIMEOUT_MS);
        const rows = await waitForRole(session, {
          role: "button",
          name: new RegExp(`^${OTHER_WORKSPACE.name} `),
        });
        check(rows.length > 0, "cancelled workspace stays listed");
        return { dialog: title };
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
