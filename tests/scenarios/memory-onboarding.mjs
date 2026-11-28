import { writeFile } from "node:fs/promises";
import path from "node:path";
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
const UNREACHABLE_AI_MEMORY = "http://127.0.0.1:9";
const args = readScenarioArgs();
const state = {};

async function railEntry(session) {
  return {
    role: "button",
    name: await translate(session, "memory:onboarding.label"),
  };
}

async function openMemoryStatus(session) {
  const region = {
    role: "region",
    name: await translate(session, "memory:onboarding.label"),
  };
  const [shown] = await queryAllByRole(session, region);
  if (shown) return region;
  await clickByRole(session, await railEntry(session), UI_TIMEOUT_MS);
  await waitForRole(session, region, UI_TIMEOUT_MS);
  return region;
}

async function writeRsrsState(extra = {}) {
  await writeFile(
    state.statePath,
    JSON.stringify({ revision: 0, live: [], deleted: [], log: [], ...extra }),
    "utf8",
  );
}

runScenario("memory-onboarding", {
  open: () => openScenarioApp(args),
  setup: async ({ session, workspaceRoot }) => {
    state.original = await daemonRequest(session, "memory.settings.get");
    state.statePath = path.join(workspaceRoot, "memory-onboarding-state.json");
    await writeRsrsState();
    state.cliPath = await writeFakeRsrs(workspaceRoot, {
      statePath: state.statePath,
    });
    await daemonRequest(session, "memory.settings.set", {
      settings: { ...state.original, enabled: true, rsrs: false },
    });
    return {};
  },
  steps: [
    [
      "healthy memory keeps the rail free of a memory entry",
      async ({ session }) => {
        await openAssistantsTab(session);
        await waitForNoRole(session, await railEntry(session), UI_TIMEOUT_MS);
        const status = await daemonRequest(session, "memory.status", {});
        check(
          status.settings.enabled && status.available && !status.provider,
          "memory is on without an external library",
          { settings: status.settings, provider: status.provider },
        );
        return {};
      },
    ],
    [
      "an unreachable ai-memory shows a failed entry naming it",
      async ({ session }) => {
        const settings = await daemonRequest(session, "memory.settings.get");
        await daemonRequest(session, "memory.settings.set", {
          settings: {
            ...settings,
            rsrs: false,
            provider: "ai-memory",
            providers: {
              ...settings.providers,
              aiMemory: { serverUrl: UNREACHABLE_AI_MEMORY },
            },
          },
        });
        await openMemoryStatus(session);
        const label = await translate(
          session,
          "memory:onboarding.state.failed",
          {
            name: "ai-memory",
          },
        );
        await session.waitUntil(
          (text) => document.body.textContent.includes(text),
          label,
          UI_TIMEOUT_MS,
        );
        const status = await daemonRequest(session, "memory.status", {});
        check(
          status.available && status.provider?.available === false,
          "memory stays available while ai-memory is unreachable",
          status.provider,
        );
        return {};
      },
    ],
    [
      "missing rsrs identity is not shown as ready",
      async ({ session }) => {
        await writeRsrsState({ identityMissing: true });
        const settings = await daemonRequest(session, "memory.settings.get");
        await daemonRequest(session, "memory.settings.set", {
          settings: {
            ...settings,
            rsrs: true,
            provider: "rsrs",
            cliPath: state.cliPath,
          },
        });
        await openMemoryStatus(session);
        const label = await translate(
          session,
          "memory:onboarding.state.failed",
          {
            name: "rsrs",
          },
        );
        await session.waitUntil(
          (text) =>
            document.body.textContent.includes(text) &&
            document.body.textContent.includes("cocurdex memory install"),
          label,
          UI_TIMEOUT_MS,
        );
        const status = await daemonRequest(session, "memory.status", {});
        check(
          status.available &&
            status.rsrsAvailable &&
            !status.cloud.hasKeys &&
            Boolean(status.error),
          "memory stays available while rsrs needs local setup",
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
    return {};
  },
});
