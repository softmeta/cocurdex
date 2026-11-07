import { createRequire } from "node:module";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import {
  centerOf,
  clickByRole,
  clickPoint,
  waitForRole,
} from "./lib/locate.mjs";
import {
  openAssistantsTab,
  showPanelView,
  translate,
} from "./lib/navigate.mjs";

const require = createRequire(
  new URL("../harness/package.json", import.meta.url),
);
const { tsImport } = await import(require.resolve("tsx/esm/api"));
const { startStubLlmServer } = await tsImport(
  require.resolve("@cocurdex/test-harness/helpers/llm-stub"),
  import.meta.url,
);

const UI_TIMEOUT_MS = 30_000;
const REPLY = "Two meetings today.";
const args = readScenarioArgs();
let stub;
const state = {};

function rowName(name) {
  return new RegExp(`^${name}\\s`);
}

async function typeInto(session, field, text) {
  await clickPoint(session, await centerOf(session, field.backendNodeId));
  await session.send("Input.insertText", { text });
}

async function seedStubModel(session) {
  const now = new Date().toISOString();
  await daemonRequest(session, "provider.config.save", {
    config: {
      id: "personal-scenario",
      name: "Personal scenario",
      baseUrl: stub.baseUrl,
      enabled: true,
      apiKeySecretId: null,
      headersJson: JSON.stringify({ Authorization: "Bearer synthetic-key" }),
      createdAt: now,
      updatedAt: now,
    },
  });
  await daemonRequest(session, "provider.model.save", {
    model: {
      providerId: "personal-scenario",
      modelId: "personal-model",
      name: "Personal model",
      api: "openai-completions",
      enabled: true,
      source: "manual",
      capabilities: ["chat", "agent"],
      createdAt: now,
      updatedAt: now,
    },
  });
}

async function setUpAssistant(session) {
  const assistant = await daemonRequest(session, "personalAgent.create", {
    role: {
      name: "Morning",
      agentId: "pi",
      providerId: "personal-scenario",
      modelId: "personal-model",
      modelName: "Personal model",
      permissionMode: null,
      sessionModeId: null,
      reasoningEffort: null,
      serviceTier: null,
      fastMode: null,
      thinkingLevel: null,
      openCodeAgent: null,
      openCodeVariant: null,
    },
  });
  await openAssistantsTab(session);
  await waitForRole(
    session,
    { role: "button", name: rowName(assistant.role.name) },
    UI_TIMEOUT_MS,
  );
  return assistant;
}

async function waitForText(session, text) {
  await session.waitUntil(
    (expected) =>
      [...document.querySelectorAll("[aria-label]")].some(
        (node) =>
          node.tagName === "SECTION" && node.textContent.includes(expected),
      ),
    text,
    UI_TIMEOUT_MS,
  );
}

async function routines(session) {
  return daemonRequest(session, "routine.list", {});
}

runScenario("routines", {
  open: () => openScenarioApp(args),
  setup: async ({ session }) => {
    stub = await startStubLlmServer();
    await seedStubModel(session);
    for (const routine of await routines(session)) {
      await daemonRequest(session, "routine.delete", { id: routine.id });
    }
    return {};
  },
  steps: [
    [
      "a routine is created from the routines panel",
      async ({ session }) => {
        state.assistant = await setUpAssistant(session);
        await showPanelView(session, "routines");
        await waitForText(
          session,
          await translate(session, "personal:routines.empty"),
        );
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "personal:routines.new"),
        });
        const [name] = await waitForRole(
          session,
          {
            role: "textbox",
            name: await translate(session, "personal:routines.name"),
          },
          UI_TIMEOUT_MS,
        );
        await typeInto(session, name, "Morning brief");
        const [prompt] = await waitForRole(session, {
          role: "textbox",
          name: await translate(session, "personal:routines.prompt"),
        });
        await typeInto(session, prompt, "Summarize today");
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "personal:routines.create"),
        });
        await waitForRole(
          session,
          {
            role: "button",
            name: await translate(session, "personal:routines.runNow"),
          },
          UI_TIMEOUT_MS,
        );
        const [routine] = await routines(session);
        check(
          routine?.name === "Morning brief" &&
            routine.agentId === state.assistant.id &&
            routine.schedule.kind === "daily" &&
            routine.schedule.weekdays === null &&
            routine.access === "read-and-draft" &&
            routine.deliver === "inbox",
          "the daemon stores the routine with safe defaults",
          routine,
        );
        state.routine = routine;
        return { routine: routine.id };
      },
    ],
    [
      "run now records a run and pause stops the schedule",
      async ({ session }) => {
        stub.plan = { kind: "stream", chunks: [REPLY] };
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "personal:routines.runNow"),
        });
        const deadline = Date.now() + UI_TIMEOUT_MS;
        let runs = [];
        while (Date.now() < deadline) {
          runs = await daemonRequest(session, "routine.runs", {
            routineId: state.routine.id,
          });
          if (runs[0]?.status && runs[0].status !== "running") break;
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        check(runs[0]?.status === "succeeded", "the run succeeded", runs);
        await session.waitUntil(
          ({ runId, label }) =>
            document
              .querySelector(`[data-routine-run-id="${runId}"]`)
              ?.textContent.includes(label) ?? false,
          {
            runId: runs[0].id,
            label: await translate(session, "personal:routines.run.succeeded"),
          },
          UI_TIMEOUT_MS,
        );
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "personal:routines.pause"),
        });
        await waitForRole(
          session,
          {
            role: "button",
            name: await translate(session, "personal:routines.resume"),
          },
          UI_TIMEOUT_MS,
        );
        const [routine] = await routines(session);
        check(
          routine.pausedReason === "user" && routine.sessionId,
          "the routine is paused and has its own thread",
          routine,
        );
        state.routine = routine;
        return {};
      },
    ],
    [
      "open thread shows the run's reply",
      async ({ session }) => {
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "personal:routines.openThread"),
        });
        await session.waitUntil(
          (reply) =>
            [...document.querySelectorAll("article")].some((node) =>
              node.textContent.includes(reply),
            ),
          REPLY,
          UI_TIMEOUT_MS,
        );
        return {};
      },
    ],
    [
      "deleting a routine asks first and removes its thread",
      async ({ session }) => {
        const deleteLabel = await translate(
          session,
          "personal:routines.delete",
        );
        await clickByRole(session, { role: "button", name: deleteLabel });
        const dialog = {
          role: "dialog",
          name: await translate(session, "personal:routines.deleteTitle", {
            name: "Morning brief",
          }),
        };
        await waitForRole(session, dialog, UI_TIMEOUT_MS);
        await clickByRole(session, {
          role: "button",
          name: deleteLabel,
          within: dialog,
        });
        await waitForText(
          session,
          await translate(session, "personal:routines.empty"),
        );
        const thread = await daemonRequest(session, "session.get", {
          sessionId: state.routine.sessionId,
        });
        check(
          (await routines(session)).length === 0 && thread === null,
          "the routine and its thread are gone",
          thread,
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
  teardown: async () => {
    await stub?.close();
    return {};
  },
});
