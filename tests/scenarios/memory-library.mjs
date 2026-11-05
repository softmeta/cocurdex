import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { writeFakeRsrs } from "@cocurdex/test-harness/fixtures/fake-rsrs/index.mjs";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import { clickByRole, waitForNoRole, waitForRole } from "./lib/locate.mjs";
import { closeEditorPanel, showPanelView, translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const args = readScenarioArgs();
const state = {};

const SEED = {
  revision: 1,
  deleted: [],
  log: [],
  live: [
    {
      id: "m-tea",
      title: "Prefers tea",
      content: "Drinks green tea in the morning",
      project: "cocurdex/me",
      tags: ["taste"],
      updated_at: "2026-11-04T08:00:00Z",
    },
    {
      id: "m-sencha",
      title: "Favorite tea is sencha",
      content: "Sencha over matcha",
      project: "cocurdex/me",
      parent_id: "m-tea",
      tags: [],
      updated_at: "2026-11-03T08:00:00Z",
    },
    {
      id: "m-coach",
      title: "Runs on Tuesdays",
      content: "Training plan from the coach",
      project: "cocurdex/agent/coach",
      tags: [],
      updated_at: "2026-11-02T08:00:00Z",
    },
  ],
};

async function readFakeState() {
  return JSON.parse(await readFile(state.statePath, "utf8"));
}

async function waitForFakeState(predicate) {
  const deadline = Date.now() + UI_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const current = await readFakeState();
    if (predicate(current)) return current;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("fake rsrs state did not reach the expected value");
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
  setup: async ({ session, workspaceRoot }) => {
    state.statePath = path.join(workspaceRoot, "fake-rsrs-state.json");
    await writeFile(state.statePath, JSON.stringify(SEED), "utf8");
    const cliPath = await writeFakeRsrs(workspaceRoot, {
      statePath: state.statePath,
    });
    state.original = await daemonRequest(session, "memory.settings.get");
    await daemonRequest(session, "memory.settings.set", {
      settings: { ...state.original, enabled: true, cliPath },
    });
    return {};
  },
  steps: [
    [
      "the memory view lists every partition by day",
      async ({ session }) => {
        state.panel = await showPanelView(session, "memory");
        for (const entry of SEED.live) {
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
        const readIndents = () => {
          const indent = (id) =>
            document.querySelector(`[data-memory-id="${id}"]`)?.style
              .paddingInlineStart ?? "";
          return { parent: indent("m-tea"), child: indent("m-sencha") };
        };
        await session.waitUntil(
          () => {
            const indent = (id) =>
              document.querySelector(`[data-memory-id="${id}"]`)?.style
                .paddingInlineStart ?? "";
            const parent = indent("m-tea");
            const child = indent("m-sencha");
            return parent !== "" && child !== "" && parent !== child;
          },
          undefined,
          UI_TIMEOUT_MS,
        );
        const indents = await session.run(readIndents);
        check(
          Number.parseFloat(indents.child) > Number.parseFloat(indents.parent),
          "child is indented under its parent",
          indents,
        );
        return {};
      },
    ],
    [
      "an edit reaches the provider and the list",
      async ({ session }) => {
        await clickByRole(session, await entryButton(session, "Prefers tea"));
        const form = {
          role: "form",
          name: await translate(session, "memory:library.detail"),
        };
        await waitForRole(session, form, UI_TIMEOUT_MS);
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
        await waitForFakeState((current) =>
          current.live.some((entry) => entry.title === "Prefers oolong tea"),
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
        await waitForFakeState((current) =>
          current.deleted.some((entry) => entry.id === "m-tea"),
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
        await waitForFakeState((current) =>
          current.live.some((entry) => entry.id === "m-tea"),
        );
        return {};
      },
    ],
    [
      "the history mode shows the change log",
      async ({ session }) => {
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "memory:library.mode.history"),
          within: await library(session),
        });
        const history = {
          role: "list",
          name: await translate(session, "memory:library.history"),
        };
        await waitForRole(session, history, UI_TIMEOUT_MS);
        const fake = await readFakeState();
        check(
          fake.log.map((row) => row.action).join(",") ===
            "restore,delete,update",
          "provider logged update, delete, restore",
          fake.log,
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
    if (state.original) {
      await daemonRequest(session, "memory.settings.set", {
        settings: state.original,
      });
    }
    if (state.panel && !state.panel.wasOpen) await closeEditorPanel(session);
    return {};
  },
});
