import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import {
  centerOf,
  clickPoint,
  queryAllByRole,
  waitForRole,
} from "./lib/locate.mjs";
import { openSettingsSection, translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const SETUP_TIMEOUT_MS = 120_000;
const args = readScenarioArgs();

function switchSelector(label) {
  const escaped = label.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return `[role="switch"][aria-label="${escaped}"]`;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function namePattern(label) {
  return new RegExp(`^${escapeRegExp(label)}(\\s|$)`);
}

async function openComposerMenu(session, attachLabel) {
  await session.waitUntil(
    (name) =>
      [...document.querySelectorAll("button")].some(
        (entry) => entry.getAttribute("aria-label") === name,
      ),
    attachLabel,
    UI_TIMEOUT_MS,
  );
  const opened = await session.run((name) => {
    const button = [...document.querySelectorAll("button")].find(
      (entry) => entry.getAttribute("aria-label") === name,
    );
    if (!button) return false;
    button.click();
    return true;
  }, attachLabel);
  check(opened, "composer attach menu is clickable");
}

async function openMemorySubmenu(session, label) {
  const [alreadyOpen] = await queryAllByRole(session, {
    role: "menuitemcheckbox",
  });
  if (alreadyOpen) return;
  const trigger = { role: "menuitem", name: namePattern(label) };
  const [present] = await queryAllByRole(session, trigger);
  if (!present) {
    const attachLabel = await translate(session, "common:actions.attach");
    await openComposerMenu(session, attachLabel);
  }
  const [match] = await waitForRole(session, trigger, UI_TIMEOUT_MS);
  const center = await centerOf(session, match.backendNodeId);
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: center.x - 40,
    y: center.y,
  });
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: center.x,
    y: center.y,
  });
  const opened = await session
    .waitUntil(
      () => document.querySelectorAll('[role="menuitemcheckbox"]').length > 0,
      null,
      5_000,
    )
    .then(() => true)
    .catch(() => false);
  if (!opened) {
    await clickPoint(session, center);
    await session.waitUntil(
      () => document.querySelectorAll('[role="menuitemcheckbox"]').length > 0,
      null,
      UI_TIMEOUT_MS,
    );
  }
}

async function clickMemoryItem(session, label) {
  const [match] = await waitForRole(
    session,
    { role: "menuitemcheckbox", name: namePattern(label) },
    UI_TIMEOUT_MS,
  );
  await clickPoint(session, await centerOf(session, match.backendNodeId));
}

async function readMemoryItem(session, label) {
  return session.run(
    ({ label }) => {
      const element = [
        ...document.querySelectorAll('[role="menuitemcheckbox"]'),
      ].find((entry) => (entry.textContent ?? "").includes(label));
      return element
        ? {
            checked: element.getAttribute("aria-checked"),
            disabled: element.getAttribute("data-disabled") !== null,
          }
        : null;
    },
    { label },
  );
}

async function waitForMemoryItem(session, label, checked) {
  await session.waitUntil(
    ({ label, expected }) => {
      const element = [
        ...document.querySelectorAll('[role="menuitemcheckbox"]'),
      ].find((entry) => (entry.textContent ?? "").includes(label));
      return element?.getAttribute("aria-checked") === expected;
    },
    { label, expected: checked },
    UI_TIMEOUT_MS,
  );
}

async function readSwitch(session, label) {
  return session.run(
    ({ selector }) => {
      const element = document.querySelector(selector);
      return element
        ? {
            checked: element.getAttribute("aria-checked"),
            disabled: element.disabled === true,
          }
        : null;
    },
    { selector: switchSelector(label) },
  );
}

async function closeMenus(session) {
  for (let index = 0; index < 3; index += 1) {
    await session.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Escape",
      code: "Escape",
      windowsVirtualKeyCode: 27,
    });
  }
  await session.waitUntil(
    () => !document.querySelector('[role="menu"]'),
    null,
    UI_TIMEOUT_MS,
  );
}

async function dismissOnboarding(session) {
  const skip = await translate(session, "onboarding:action.skip");
  const attach = await translate(session, "common:actions.attach");
  await session.waitUntil(
    ({ skip, attach }) => {
      const buttons = [...document.querySelectorAll("button")];
      return (
        buttons.some((entry) => entry.innerText.trim() === skip) ||
        buttons.some((entry) => entry.getAttribute("aria-label") === attach)
      );
    },
    { skip, attach },
    SETUP_TIMEOUT_MS,
  );
  await session.run((name) => {
    const button = [...document.querySelectorAll("button")].find(
      (entry) => entry.innerText.trim() === name,
    );
    button?.click();
  }, skip);
}

runScenario("memory-switch", {
  open: () => openScenarioApp(args),
  setup: async ({ session }) => {
    await dismissOnboarding(session);
    const memoryLabel = await translate(session, "memory:switch.label");
    const enableLabel = await translate(session, "memory:menu.enable");
    const syncLabel = await translate(session, "memory:menu.sync");
    const settingsLabel = await translate(session, "memory:menu.settings");
    await openMemorySubmenu(session, memoryLabel);
    await session.waitUntil(
      ({ label }) =>
        [...document.querySelectorAll('[role="menuitemcheckbox"]')].some(
          (element) => (element.textContent ?? "").includes(label),
        ),
      { label: enableLabel },
      UI_TIMEOUT_MS,
    );
    return { memoryLabel, enableLabel, syncLabel, settingsLabel };
  },
  steps: [
    [
      "the composer menu exposes memory as a submenu",
      async ({ session, enableLabel, syncLabel, settingsLabel }) => {
        const items = await queryAllByRole(session, {
          role: "menuitemcheckbox",
        });
        const names = items.map((item) => item.name);
        check(
          names.some((name) => name.includes(enableLabel)),
          "memory enable item exists",
          names,
        );
        check(
          names.some((name) => name.includes(syncLabel)),
          "multi-device sync item exists",
          names,
        );
        const settingsItem = await queryAllByRole(session, {
          role: "menuitem",
          name: settingsLabel,
        });
        check(settingsItem.length === 1, "memory settings item exists");
        return { names };
      },
    ],
    [
      "the composer memory toggle is on by default",
      async ({ session, enableLabel }) => {
        const state = await readMemoryItem(session, enableLabel);
        check(state?.checked === "true", "memory toggle defaults on", state);
        const settings = await daemonRequest(session, "memory.settings.get");
        check(
          settings.enabled === true,
          "daemon setting defaults on",
          settings,
        );
        return { state };
      },
    ],
    [
      "turning memory off persists",
      async ({ session, enableLabel, memoryLabel }) => {
        await openMemorySubmenu(session, memoryLabel);
        await clickMemoryItem(session, enableLabel);
        await waitForMemoryItem(session, enableLabel, "false");
        const settings = await daemonRequest(session, "memory.settings.get");
        check(settings.enabled === false, "daemon setting is off", settings);
        return { enabled: settings.enabled };
      },
    ],
    [
      "turning memory back on persists",
      async ({ session, enableLabel, memoryLabel }) => {
        await openMemorySubmenu(session, memoryLabel);
        await clickMemoryItem(session, enableLabel);
        await waitForMemoryItem(session, enableLabel, "true");
        const settings = await daemonRequest(session, "memory.settings.get");
        check(settings.enabled === true, "daemon setting is on", settings);
        return { enabled: settings.enabled };
      },
    ],
    [
      "the memory settings section exposes cloud sync",
      async ({ session }) => {
        await closeMenus(session);
        await openSettingsSection(session, "memory");
        const masterLabel = await translate(
          session,
          "memory:settings.enabled.title",
        );
        await session.waitUntil(
          ({ selector }) => Boolean(document.querySelector(selector)),
          { selector: switchSelector(masterLabel) },
          SETUP_TIMEOUT_MS,
        );
        const master = await readSwitch(session, masterLabel);
        check(master?.checked === "true", "master switch is on", master);

        const syncTitle = await translate(
          session,
          "memory:settings.cloud.title",
        );
        const sync = await readSwitch(session, syncTitle);
        check(sync !== null, "multi-device sync switch exists", sync);
        return { master, sync };
      },
    ],
    [
      "the memory page links to the Respire website and source code",
      async ({ session }) => {
        const siteTitle = await translate(
          session,
          "memory:settings.links.site.title",
        );
        const repoTitle = await translate(
          session,
          "memory:settings.links.repo.title",
        );
        const text = await session.run(() => document.body.innerText);
        check(text.includes(siteTitle), "website row is visible", siteTitle);
        check(
          text.includes(repoTitle),
          "source code row is visible",
          repoTitle,
        );
        return { siteTitle, repoTitle };
      },
    ],
  ],
  teardown: async ({ session }) => {
    const settings = await daemonRequest(session, "memory.settings.get");
    await daemonRequest(session, "memory.settings.set", {
      settings: { ...settings, enabled: true },
    });
  },
});
