import { writeFakeRsrs } from "@cocurdex/test-harness/fixtures/fake-rsrs/index.mjs";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import {
  clickByRole,
  queryAllByRole,
  waitForNoRole,
  waitForRole,
} from "./lib/locate.mjs";
import { openAssistantsTab, translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const SKIPPED_KEY = "cocurdex.memory-onboarding-skipped";
const args = readScenarioArgs();
const state = {};

async function openMemoryStatus(session) {
  const region = await memoryRegion(session, "memory:onboarding.label");
  const [shown] = await queryAllByRole(session, region);
  if (shown) return region;
  await clickByRole(
    session,
    {
      role: "button",
      name: await translate(session, "memory:onboarding.label"),
    },
    UI_TIMEOUT_MS,
  );
  await waitForRole(session, region, UI_TIMEOUT_MS);
  return region;
}

async function memoryRegion(session, labelKey) {
  return { role: "region", name: await translate(session, labelKey) };
}

runScenario("memory-onboarding", {
  open: () => openScenarioApp(args),
  setup: async ({ session, workspaceRoot }) => {
    state.original = await daemonRequest(session, "memory.settings.get");
    state.statePath = path.join(workspaceRoot, "memory-onboarding-state.json");
    await writeFile(
      state.statePath,
      JSON.stringify({ revision: 0, live: [], deleted: [], log: [] }),
      "utf8",
    );
    const cliPath = await writeFakeRsrs(workspaceRoot, {
      statePath: state.statePath,
    });
    await daemonRequest(session, "memory.settings.set", {
      settings: { ...state.original, enabled: false, cliPath },
    });
    await session.run((key) => {
      localStorage.removeItem(key);
      return true;
    }, SKIPPED_KEY);
    return {};
  },
  steps: [
    [
      "the assistants form offers to turn memory on",
      async ({ session }) => {
        await openAssistantsTab(session);
        const offer = await memoryRegion(session, "memory:onboarding.title");
        await waitForRole(session, offer, UI_TIMEOUT_MS);
        await waitForRole(session, {
          role: "button",
          name: await translate(session, "memory:onboarding.enable"),
          within: offer,
        });
        return {};
      },
    ],
    [
      "skipping keeps a turn-on entry",
      async ({ session }) => {
        const offer = await memoryRegion(session, "memory:onboarding.title");
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "memory:onboarding.skip"),
          within: offer,
        });
        await waitForNoRole(session, offer, UI_TIMEOUT_MS);
        await openMemoryStatus(session);
        const offText = await translate(session, "memory:onboarding.state.off");
        await session.waitUntil(
          (text) => document.body.textContent.includes(text),
          offText,
          UI_TIMEOUT_MS,
        );
        const skipped = await session.run(
          (key) => localStorage.getItem(key),
          SKIPPED_KEY,
        );
        check(skipped === "true", "the skip survives a restart", skipped);
        return {};
      },
    ],
    [
      "turning memory on from the entry reaches the ready state",
      async ({ session }) => {
        const row = await openMemoryStatus(session);
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "memory:onboarding.enable"),
          within: row,
        });
        const readyText = await translate(
          session,
          "memory:onboarding.state.ready",
        );
        await session.waitUntil(
          (text) => document.body.textContent.includes(text),
          readyText,
          UI_TIMEOUT_MS,
        );
        const status = await daemonRequest(session, "memory.status", {});
        check(
          status.settings.enabled && status.available,
          "the daemon reports memory on and available",
          { enabled: status.settings.enabled, available: status.available },
        );
        return {};
      },
    ],
    [
      "sync opens the account dialog",
      async ({ session }) => {
        const row = await openMemoryStatus(session);
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "memory:onboarding.sync"),
          within: row,
        });
        const dialog = {
          role: "dialog",
          name: await translate(session, "memory:cloud.title"),
        };
        await waitForRole(session, dialog, UI_TIMEOUT_MS);
        await session.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        });
        await waitForNoRole(session, dialog, UI_TIMEOUT_MS);
        return {};
      },
    ],
    [
      "missing local identity is not shown as ready",
      async ({ session }) => {
        await writeFile(
          state.statePath,
          JSON.stringify({
            revision: 0,
            live: [],
            deleted: [],
            log: [],
            identityMissing: true,
          }),
          "utf8",
        );
        const settings = await daemonRequest(session, "memory.settings.get");
        await daemonRequest(session, "memory.settings.set", { settings });
        await openMemoryStatus(session);
        const label = await translate(
          session,
          "memory:onboarding.state.failed",
        );
        await session.waitUntil(
          (text) =>
            document.body.textContent.includes(text) &&
            document.body.textContent.includes("rsrs keygen"),
          label,
          UI_TIMEOUT_MS,
        );
        const status = await daemonRequest(session, "memory.status", {});
        check(
          status.available && !status.cloud.hasKeys && Boolean(status.error),
          "installed memory needs local setup",
          status.error,
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
    await session.run((key) => {
      localStorage.removeItem(key);
      return true;
    }, SKIPPED_KEY);
    return {};
  },
});

import { writeFile } from "node:fs/promises";
import path from "node:path";
