import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clickByRole, clickPoint, waitForRole } from "./lib/locate.mjs";
import { showPanelView, translate } from "./lib/navigate.mjs";

const FLYOUT_GAP = 4;
const GAP_TOLERANCE = 0.5;
const UI_TIMEOUT_MS = 30_000;

const args = readScenarioArgs();

async function centerByRole(session, query) {
  const [match] = await waitForRole(session, query, UI_TIMEOUT_MS);
  await session.send("DOM.getDocument", { depth: 0 });
  const { model } = await session.send("DOM.getBoxModel", {
    backendNodeId: match.backendNodeId,
  });
  const [left, top, , , right, bottom] = model.border;
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

async function hover(session, point) {
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...point,
  });
}

async function rightClick(session, point) {
  await hover(session, point);
  for (const type of ["mousePressed", "mouseReleased"]) {
    await session.send("Input.dispatchMouseEvent", {
      type,
      button: "right",
      clickCount: 1,
      ...point,
    });
  }
}

async function closeMenus(session) {
  for (let count = 0; count < 3; count += 1) {
    for (const type of ["keyDown", "keyUp"]) {
      await session.send("Input.dispatchKeyEvent", {
        type,
        key: "Escape",
        code: "Escape",
        windowsVirtualKeyCode: 27,
      });
    }
  }
  await session.waitUntil(
    () => !document.querySelector('[role="menu"]'),
    null,
    UI_TIMEOUT_MS,
  );
}

const SUBMENU_SLOTS = ["dropdown-menu-sub-content", "context-menu-sub-content"];

function measureOpenFlyout(subSlots) {
  const trigger = document.querySelector(
    '[role="menuitem"][aria-haspopup="menu"][data-popup-open]',
  );
  const flyout = document.querySelector(
    subSlots.map((slot) => `[data-slot="${slot}"][data-open]`).join(","),
  );
  const surface = trigger?.closest('[data-slot$="-content"]');
  if (!flyout || !surface || flyout.getAnimations().length > 0) return null;
  const parent = surface.getBoundingClientRect();
  const child = flyout.getBoundingClientRect();
  const gap =
    child.left >= parent.right
      ? child.left - parent.right
      : parent.left - child.right;
  const look = (element) => {
    const style = getComputedStyle(element);
    const row = element.querySelector('[role="menuitem"]');
    const rowStyle = row ? getComputedStyle(row) : null;
    return {
      radius: style.borderTopLeftRadius,
      padding: style.padding,
      border: `${style.borderTopWidth} ${style.borderTopColor}`,
      shadow: style.boxShadow,
      background: style.backgroundColor,
      rowHeight: row?.getBoundingClientRect().height,
      rowFont: rowStyle?.fontSize,
      rowPadding: rowStyle?.padding,
      rowRadius: rowStyle?.borderTopLeftRadius,
    };
  };
  return {
    gap: Number(gap.toFixed(2)),
    parentPadding: getComputedStyle(surface).paddingInlineEnd,
    parent: look(surface),
    child: look(flyout),
  };
}

function menuSurfacesSettled() {
  const surfaces = document.querySelectorAll(
    '[data-slot$="-content"][data-open]',
  );
  return (
    surfaces.length > 0 &&
    [...surfaces].every((surface) => surface.getAnimations().length === 0)
  );
}

async function openSubmenu(session, name) {
  await session.waitUntil(menuSurfacesSettled, null, UI_TIMEOUT_MS);
  const center = await centerByRole(session, { role: "menuitem", name });
  await hover(session, { x: center.x - 40, y: center.y });
  await hover(session, center);
  await session.waitUntil(measureOpenFlyout, SUBMENU_SLOTS, UI_TIMEOUT_MS);
  return session.run(measureOpenFlyout, SUBMENU_SLOTS);
}

const SURFACE_KEYS = ["radius", "padding", "border", "shadow", "background"];
const ROW_KEYS = ["rowHeight", "rowFont", "rowPadding", "rowRadius"];

function sameLook(parent, child, keys) {
  return keys.every(
    (key) => child[key] === undefined || parent[key] === child[key],
  );
}

function checkGap(measurement, label) {
  check(
    Math.abs(measurement.gap - FLYOUT_GAP) <= GAP_TOLERANCE,
    `${label} flyout gap is not ${FLYOUT_GAP}px`,
    measurement,
  );
  check(
    sameLook(measurement.parent, measurement.child, SURFACE_KEYS),
    `${label} flyout surface differs from its parent`,
    measurement,
  );
  check(
    sameLook(measurement.parent, measurement.child, ROW_KEYS),
    `${label} flyout rows differ from its parent`,
    measurement,
  );
  return { gap: measurement.gap, radius: measurement.child.radius };
}

runScenario("menu-flyouts", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    const viewMenu = await translate(session, "sessions:sidebar.view.menu");
    await waitForRole(
      session,
      { role: "button", name: viewMenu },
      UI_TIMEOUT_MS,
    );
    return { viewMenu };
  },
  steps: [
    [
      "a default dropdown submenu matches its parent",
      async ({ session, viewMenu }) => {
        await clickByRole(session, { role: "button", name: viewMenu });
        const name = await translate(
          session,
          "sessions:sidebar.view.statusFilter",
        );
        const measurement = await openSubmenu(session, name);
        await closeMenus(session);
        return checkGap(measurement, "sidebar view menu");
      },
    ],
    [
      "a composer submenu matches its parent",
      async ({ session }) => {
        const attach = await translate(session, "common:actions.attach");
        await clickByRole(session, { role: "button", name: attach });
        const name = await translate(
          session,
          "sessions:composer.attachMenu.notes",
        );
        const measurement = await openSubmenu(session, name);
        await closeMenus(session);
        return checkGap(measurement, "composer attach menu");
      },
    ],
    [
      "a context submenu matches its parent",
      async ({ session }) => {
        await clickByRole(session, {
          role: "button",
          name: /^Draft release notes /,
        });
        await showPanelView(session, "notes");
        const row = await centerByRole(session, {
          role: "button",
          name: "Checkout spec",
        });
        await rightClick(session, row);
        const name = await translate(session, "notes:sidebar.moveTo");
        const measurement = await openSubmenu(session, name);
        await closeMenus(session);
        await clickPoint(session, { x: 1, y: 1 });
        return checkGap(measurement, "note context menu");
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
  teardown: async ({ session }) => {
    const editorTab = await translate(session, "editor:actions.showEditor");
    await clickByRole(session, { role: "button", name: editorTab });
    return {};
  },
});
