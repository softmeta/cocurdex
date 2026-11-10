import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clickByRole, queryAllByRole, waitForRole } from "./lib/locate.mjs";
import { openSettingsSection, translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const REVEAL_TIMEOUT_MS = 5_000;
const args = readScenarioArgs();

// Rows that render only with data or host state the isolated instance lacks.
const CONDITIONAL_ANCHORS = new Set(["devices.accessLog"]);

async function pressKey(session, key, code, keyCode) {
  for (const type of ["keyDown", "keyUp"]) {
    await session.send("Input.dispatchKeyEvent", {
      type,
      key,
      code,
      windowsVirtualKeyCode: keyCode,
    });
  }
}

async function typeQuery(session, searchLabel, text) {
  await clickByRole(
    session,
    { role: "searchbox", name: searchLabel },
    UI_TIMEOUT_MS,
  );
  await session.run(() => document.activeElement?.select?.());
  if (text) {
    await session.send("Input.insertText", { text });
  } else {
    await pressKey(session, "Backspace", "Backspace", 8);
  }
}

function readResultIds(session) {
  return session.run(() =>
    [...document.querySelectorAll("[data-settings-search-result]")].map(
      (element) => element.getAttribute("data-settings-search-result"),
    ),
  );
}

function highlightedRowId() {
  const anchor = document.querySelector("[data-settings-search-hit]");
  if (!anchor) return null;
  const rect = anchor.getBoundingClientRect();
  const visible =
    rect.height > 0 && rect.top >= 0 && rect.bottom <= window.innerHeight;
  return visible ? anchor.getAttribute("data-settings-search-id") : null;
}

async function waitForHighlightedRow(session) {
  const found = await session
    .waitUntil(highlightedRowId, null, REVEAL_TIMEOUT_MS)
    .catch(() => false);
  return found ? session.run(highlightedRowId) : null;
}

runScenario("settings-search", {
  open: () => openScenarioApp(args),
  setup: async ({ session }) => {
    await openSettingsSection(session, "general");
    const t = (key, options) => translate(session, `settings:${key}`, options);
    const searchLabel = await t("sidebar.search");
    await waitForRole(
      session,
      { role: "searchbox", name: searchLabel },
      UI_TIMEOUT_MS,
    );
    return { searchLabel, t };
  },
  steps: [
    [
      "a query in either language lists the matching setting",
      async ({ session, searchLabel, t }) => {
        const proxyTitle = await t("network.proxy.httpProxy.title");
        for (const query of ["proxy", "代理"]) {
          await typeQuery(session, searchLabel, query);
          await waitForRole(
            session,
            { role: "button", name: proxyTitle },
            UI_TIMEOUT_MS,
          );
        }
        return { proxyTitle };
      },
    ],
    [
      "choosing a result opens its section and highlights the row in view",
      async ({ session, searchLabel, t }) => {
        await typeQuery(session, searchLabel, "proxy");
        const proxyTitle = await t("network.proxy.httpProxy.title");
        await clickByRole(
          session,
          { role: "button", name: proxyTitle },
          UI_TIMEOUT_MS,
        );
        await waitForRole(
          session,
          { role: "heading", name: await t("sections.environment") },
          UI_TIMEOUT_MS,
        );
        const highlighted = await waitForHighlightedRow(session);
        check(
          highlighted === "environment.proxyMode",
          "a hidden manual proxy field falls back to the proxy mode row",
          { highlighted },
        );
        return { highlighted };
      },
    ],
    [
      "Enter opens the first result from the keyboard",
      async ({ session, searchLabel, t }) => {
        await typeQuery(session, searchLabel, "minimap");
        await pressKey(session, "Enter", "Enter", 13);
        await waitForRole(
          session,
          { role: "heading", name: await t("sections.editor") },
          UI_TIMEOUT_MS,
        );
        return {};
      },
    ],
    [
      "an unmatched query says so, and Escape restores the section list",
      async ({ session, searchLabel, t }) => {
        await typeQuery(session, searchLabel, "zzzz-no-such-setting");
        const empty = await t("sidebar.searchEmpty");
        await session.waitUntil(
          (text) => (document.body.textContent ?? "").includes(text),
          empty,
          UI_TIMEOUT_MS,
        );
        await pressKey(session, "Escape", "Escape", 27);
        const generalLabel = await t("sections.general");
        await waitForRole(
          session,
          { role: "button", name: generalLabel, within: { role: "list" } },
          UI_TIMEOUT_MS,
        );
        const value = await session.run(
          () => document.querySelector('input[role="searchbox"]')?.value,
        );
        check(value === "", "Escape clears the query", { value });
        return {};
      },
    ],
    [
      "every indexed setting has a row to jump to",
      async ({ session, searchLabel, t }) => {
        const sectionIds = await session.run(() =>
          [...document.querySelectorAll("[data-settings-section]")].map(
            (element) => element.getAttribute("data-settings-section"),
          ),
        );
        check(sectionIds.length > 0, "the sidebar lists sections");
        const missing = [];
        const fallbacks = [];
        let reached = 0;
        for (const section of sectionIds) {
          const labelKey = section === "apps" ? "connections" : section;
          await typeQuery(
            session,
            searchLabel,
            await t(`sections.${labelKey}`),
          );
          const settingIds = (await readResultIds(session)).filter((id) =>
            id.startsWith(`${section}.`),
          );
          for (const id of settingIds) {
            await session.run((resultId) => {
              document
                .querySelector(
                  `[data-settings-search-result="${CSS.escape(resultId)}"]`,
                )
                ?.click();
            }, id);
            const highlighted = await waitForHighlightedRow(session);
            if (highlighted === id) reached += 1;
            else if (highlighted) fallbacks.push({ id, highlighted });
            else if (!CONDITIONAL_ANCHORS.has(id)) missing.push(id);
          }
        }
        check(missing.length === 0, "every result reveals its row", {
          missing,
        });
        const [stillSearching] = await queryAllByRole(session, {
          role: "searchbox",
          name: searchLabel,
        });
        check(Boolean(stillSearching), "search box stays available");
        await typeQuery(session, searchLabel, "");
        return { reached, fallbacks, sections: sectionIds.length };
      },
    ],
  ],
  teardown: async () => {},
});
