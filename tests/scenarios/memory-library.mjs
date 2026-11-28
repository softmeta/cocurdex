import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import { clickByRole, waitForNoRole, waitForRole } from "./lib/locate.mjs";
import { closeEditorPanel, showPanelView, translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const args = readScenarioArgs();
const state = { ids: {} };

const SEED = [
  {
    key: "tea",
    title: "Prefers tea",
    content: "Drinks green tea in the morning",
    project: "cocurdex/me",
    tags: ["taste"],
  },
  {
    key: "sencha",
    title: "Favorite tea is sencha",
    content: "Sencha over matcha",
    project: "cocurdex/me",
    parent: "tea",
  },
  {
    key: "coach",
    title: "Runs on Tuesdays",
    content: "Training plan from the coach",
    project: "cocurdex/agent/coach",
  },
];

async function liveTitles(session) {
  const { items } = await daemonRequest(session, "memory.list", {});
  return items.map((entry) => entry.title);
}

async function library(session) {
  return {
    role: "region",
    name: await translate(session, "memory:library.label"),
  };
}

async function entryButton(session, title) {
  return { role: "button", name: title, within: await library(session) };
}

runScenario("memory-library", {
  open: () => openScenarioApp(args),
  setup: async ({ session }) => {
    state.original = await daemonRequest(session, "memory.settings.get");
    await daemonRequest(session, "memory.settings.set", {
      settings: { ...state.original, enabled: true, rsrs: false },
    });
    for (const { key, parent, ...entry } of SEED) {
      const saved = await daemonRequest(session, "memory.remember", {
        ...entry,
        ...(parent ? { parentId: state.ids[parent] } : {}),
        force: true,
      });
      state.ids[key] = saved.id;
    }
    return {};
  },
  steps: [
    [
      "the memory view lists every partition by day",
      async ({ session }) => {
        state.panel = await showPanelView(session, "memory");
        for (const entry of SEED) {
          await waitForRole(
            session,
            await entryButton(session, entry.title),
            UI_TIMEOUT_MS,
          );
        }
        return {};
      },
    ],
    [
      "the tree mode nests a memory under its parent",
      async ({ session }) => {
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "memory:library.mode.tree"),
          within: await library(session),
        });
        const ids = { parent: state.ids.tea, child: state.ids.sencha };
        await session.waitUntil(
          (ids) => {
            const indent = (id) =>
              document.querySelector(`[data-memory-id="${id}"]`)?.style
                .paddingInlineStart ?? "";
            const parent = indent(ids.parent);
            const child = indent(ids.child);
            return parent !== "" && child !== "" && parent !== child;
          },
          ids,
          UI_TIMEOUT_MS,
        );
        const indents = await session.run((ids) => {
          const indent = (id) =>
            document.querySelector(`[data-memory-id="${id}"]`)?.style
              .paddingInlineStart ?? "";
          return { parent: indent(ids.parent), child: indent(ids.child) };
        }, ids);
        check(
          Number.parseFloat(indents.child) > Number.parseFloat(indents.parent),
          "child is indented under its parent",
          indents,
        );
        return {};
      },
    ],
    [
      "an edit reaches the store and the list",
      async ({ session }) => {
        await clickByRole(session, await entryButton(session, "Prefers tea"));
        const form = {
          role: "form",
          name: await translate(session, "memory:library.detail"),
        };
        await waitForRole(session, form, UI_TIMEOUT_MS);
        await session.waitUntil(
          () => {
            const title = document.getElementById("memory-entry-title");
            return Boolean(title) && !title.readOnly;
          },
          null,
          UI_TIMEOUT_MS,
        );
        await session.run(() => {
          window.__scenario.setInput(
            document.getElementById("memory-entry-title"),
            "Prefers oolong tea",
          );
          return true;
        });
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "memory:library.save"),
          within: form,
        });
        await waitForRole(
          session,
          await entryButton(session, "Prefers oolong tea"),
          UI_TIMEOUT_MS,
        );
        const titles = await liveTitles(session);
        check(
          titles.includes("Prefers oolong tea"),
          "the store holds the edited title",
          titles,
        );
        return {};
      },
    ],
    [
      "a deleted memory comes back through undo",
      async ({ session }) => {
        const form = {
          role: "form",
          name: await translate(session, "memory:library.detail"),
        };
        const forget = await translate(session, "memory:library.forget");
        await clickByRole(session, {
          role: "button",
          name: forget,
          within: form,
        });
        const dialog = {
          role: "dialog",
          name: await translate(session, "memory:library.forgetTitle"),
        };
        await waitForRole(session, dialog, UI_TIMEOUT_MS);
        await clickByRole(session, {
          role: "button",
          name: forget,
          within: dialog,
        });
        await waitForNoRole(
          session,
          await entryButton(session, "Prefers oolong tea"),
          UI_TIMEOUT_MS,
        );
        const afterDelete = await liveTitles(session);
        check(
          !afterDelete.includes("Prefers oolong tea"),
          "the store no longer lists the deleted memory",
          afterDelete,
        );
        await clickByRole(
          session,
          {
            role: "button",
            name: await translate(session, "memory:library.undo"),
          },
          UI_TIMEOUT_MS,
        );
        await waitForRole(
          session,
          await entryButton(session, "Prefers oolong tea"),
          UI_TIMEOUT_MS,
        );
        const afterUndo = await liveTitles(session);
        check(
          afterUndo.includes("Prefers oolong tea"),
          "the store lists the restored memory",
          afterUndo,
        );
        return {};
      },
    ],
    [
      "a deleted memory is listed under recently deleted and restores from there",
      async ({ session }) => {
        await daemonRequest(session, "memory.forget", { id: state.ids.tea });
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "memory:library.mode.deleted"),
          within: await library(session),
        });
        const deleted = {
          role: "list",
          name: await translate(session, "memory:library.deleted"),
        };
        await waitForRole(session, deleted, UI_TIMEOUT_MS);
        await clickByRole(
          session,
          {
            role: "button",
            name: await translate(session, "memory:library.restore"),
            within: deleted,
          },
          UI_TIMEOUT_MS,
        );
        await waitForNoRole(session, deleted, UI_TIMEOUT_MS);
        const log = await daemonRequest(session, "memory.history", {
          id: state.ids.tea,
        });
        const actions = log.map((row) => row.action).join(",");
        check(
          actions === "restore,delete,restore,delete,update,create",
          "the store logged create, update, delete, restore twice",
          actions,
        );
        return {};
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
    for (const id of Object.values(state.ids)) {
      await daemonRequest(session, "memory.forget", { id }).catch(() => null);
    }
    if (state.original) {
      await daemonRequest(session, "memory.settings.set", {
        settings: state.original,
      });
    }
    if (state.panel && !state.panel.wasOpen) await closeEditorPanel(session);
    return {};
  },
});
