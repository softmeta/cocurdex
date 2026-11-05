import { createRequire } from "node:module";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import {
  centerOf,
  clickByRole,
  clickPoint,
  waitForNoRole,
  waitForRole,
} from "./lib/locate.mjs";
import { translate } from "./lib/navigate.mjs";

const require = createRequire(
  new URL("../harness/package.json", import.meta.url),
);
const { tsImport } = await import(require.resolve("tsx/esm/api"));
const { startStubLlmServer } = await tsImport(
  require.resolve("@cocurdex/test-harness/helpers/llm-stub"),
  import.meta.url,
);

const UI_TIMEOUT_MS = 30_000;
const REPLY = "Ten push-ups, then stretch.";
const args = readScenarioArgs();
let stub;
const state = {};

function rowName(name) {
  return new RegExp(`^${name}`);
}

async function personas(session) {
  return daemonRequest(session, "personalAgent.list");
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

runScenario("personal-agents", {
  open: () => openScenarioApp(args),
  setup: async ({ session }) => {
    stub = await startStubLlmServer();
    await seedStubModel(session);
    return {};
  },
  steps: [
    [
      "the assistants tab creates and opens the default assistant",
      async ({ session }) => {
        await clickByRole(
          session,
          {
            role: "tab",
            name: await translate(session, "personal:sidebar.title"),
          },
          UI_TIMEOUT_MS,
        );
        const defaultName = await translate(session, "personal:defaultName");
        await waitForRole(
          session,
          { role: "button", name: rowName(defaultName) },
          UI_TIMEOUT_MS,
        );
        const [assistant] = await personas(session);
        check(
          assistant?.isDefault && assistant.role.name === defaultName,
          "daemon holds one localized default assistant",
          assistant,
        );
        const {
          id: _id,
          createdAt: _c,
          updatedAt: _u,
          ...role
        } = assistant.role;
        await daemonRequest(session, "personalAgent.update", {
          id: assistant.id,
          role: {
            ...role,
            providerId: "personal-scenario",
            modelId: "personal-model",
            modelName: "Personal model",
          },
        });
        await clickByRole(
          session,
          { role: "button", name: rowName(defaultName) },
          UI_TIMEOUT_MS,
        );
        await waitForRole(session, { role: "textbox" }, UI_TIMEOUT_MS);
        const selected = await session.run(
          (id) =>
            document
              .querySelector(`[data-personal-agent-id="${id}"]`)
              ?.hasAttribute("data-active") ?? false,
          assistant.id,
        );
        check(selected, "the default assistant row is selected");
        state.homeSessionId = assistant.homeSessionId;
        return { homeSessionId: assistant.homeSessionId };
      },
    ],
    [
      "the assistant answers in its home thread",
      async ({ session }) => {
        const { homeSessionId } = state;
        stub.plan = {
          kind: "stream",
          chunks: ["Ten push-ups,", " then stretch."],
        };
        const [composer] = await waitForRole(session, { role: "textbox" });
        await typeInto(session, composer, "Plan my workout");
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "common:actions.send"),
        });
        await session.waitUntil(
          (reply) =>
            [...document.querySelectorAll("article")].some((node) =>
              node.textContent.includes(reply),
            ),
          REPLY,
          UI_TIMEOUT_MS,
        );
        const snapshot = await daemonRequest(session, "session.snapshot", {
          sessionId: homeSessionId,
        });
        const contents = snapshot.messages.map((message) => message.content);
        check(
          contents.includes("Plan my workout") && contents.includes(REPLY),
          "the exchange is stored in the assistant's home thread",
          contents,
        );
        return {};
      },
    ],
    [
      "a new assistant is named in the edit dialog",
      async ({ session }) => {
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "personal:roster.new"),
        });
        const dialog = {
          role: "dialog",
          name: await translate(session, "personal:edit.title"),
        };
        await waitForRole(session, dialog, UI_TIMEOUT_MS);
        const [nameField] = await waitForRole(session, {
          role: "textbox",
          name: await translate(session, "settings:agentRoles.name"),
          within: dialog,
        });
        await clickPoint(
          session,
          await centerOf(session, nameField.backendNodeId),
        );
        await session.run(() => {
          document.execCommand("selectAll");
          return true;
        });
        await session.send("Input.insertText", { text: "Coach" });
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "settings:agentRoles.save"),
          within: dialog,
        });
        await waitForNoRole(session, dialog, UI_TIMEOUT_MS);
        await waitForRole(
          session,
          { role: "button", name: rowName("Coach") },
          UI_TIMEOUT_MS,
        );
        const coach = (await personas(session)).find(
          (agent) => agent.role.name === "Coach",
        );
        check(
          coach && !coach.isDefault && coach.role.modelId === "personal-model",
          "the new assistant starts from the default assistant's model",
          coach,
        );
        const roles = await daemonRequest(session, "agentRole.list");
        check(
          !roles.some((role) => role.id === coach.role.id),
          "assistant roles stay out of the agent role list",
          roles.map((role) => role.name),
        );
        state.coach = coach;
        return { coach: coach.id };
      },
    ],
    [
      "deleting an assistant asks first and removes its thread",
      async ({ session }) => {
        const { coach } = state;
        await clickByRole(
          session,
          { role: "button", name: rowName("Coach") },
          UI_TIMEOUT_MS,
          "right",
        );
        await clickByRole(session, {
          role: "menuitem",
          name: await translate(session, "personal:menu.delete"),
        });
        const dialog = {
          role: "dialog",
          name: await translate(session, "personal:delete.title", {
            name: "Coach",
          }),
        };
        await waitForRole(session, dialog, UI_TIMEOUT_MS);
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "personal:delete.confirm"),
          within: dialog,
        });
        await waitForNoRole(
          session,
          { role: "button", name: rowName("Coach") },
          UI_TIMEOUT_MS,
        );
        const remaining = await personas(session);
        const home = await daemonRequest(session, "session.get", {
          sessionId: coach.homeSessionId,
        });
        check(
          remaining.length === 1 && remaining[0].isDefault && home === null,
          "only the default assistant remains and the thread is gone",
          { remaining: remaining.map((agent) => agent.role.name), home },
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
