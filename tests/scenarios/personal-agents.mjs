import { createRequire } from "node:module";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import {
  centerOf,
  clickByRole,
  clickPoint,
  queryAllByRole,
  waitForNoRole,
  waitForRole,
} from "./lib/locate.mjs";
import { openAssistantsTab, translate } from "./lib/navigate.mjs";

const BRIEF_RESULTS_TITLE = {
  "en-US": "Routine results",
  "zh-CN": "例行任务结果",
};

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
  return new RegExp(`^${name}\\s`);
}

async function personas(session) {
  return daemonRequest(session, "personalAgent.list");
}

async function composerQuery(session) {
  return {
    role: "textbox",
    name: await translate(session, "personal:thread.placeholder", {
      name: await translate(session, "personal:defaultName"),
    }),
    exact: false,
  };
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
        await openAssistantsTab(session);
        const defaultName = await translate(session, "personal:defaultName");
        await waitForRole(
          session,
          { role: "button", name: rowName(defaultName) },
          UI_TIMEOUT_MS,
        );
        await waitForRole(session, await composerQuery(session), UI_TIMEOUT_MS);
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
        await waitForRole(session, await composerQuery(session), UI_TIMEOUT_MS);
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
        const suggestion = await translate(
          session,
          "personal:thread.suggestions.attention",
        );
        await clickByRole(
          session,
          { role: "button", name: suggestion },
          UI_TIMEOUT_MS,
        );
        const shown = await session
          .waitUntil(
            (reply) =>
              [...document.querySelectorAll("article")].some((node) =>
                node.textContent.includes(reply),
              ),
            REPLY,
            UI_TIMEOUT_MS,
          )
          .then(
            () => true,
            () => false,
          );
        const snapshot = await daemonRequest(session, "session.snapshot", {
          sessionId: homeSessionId,
        });
        const contents = snapshot.messages.map((message) => message.content);
        check(shown, "the reply shows in the home thread", {
          model: snapshot.session.providerSnapshot,
          run: snapshot.activeRun,
          stubRequests: stub.requests.length,
          textboxes: (await queryAllByRole(session, { role: "textbox" })).map(
            (box) => box.name,
          ),
          focused: await session.run(
            () => document.activeElement?.outerHTML.slice(0, 300) ?? null,
          ),
          messages: snapshot.messages.map(({ role, content }) => ({
            role,
            content: content.slice(0, 200),
          })),
        });
        check(
          contents.includes(suggestion) && contents.includes(REPLY),
          "the exchange is stored in the assistant's home thread",
          contents,
        );
        return {};
      },
    ],
    [
      "a routine result posts to the home thread and links its run",
      async ({ session }) => {
        const [assistant] = await personas(session);
        const routine = await daemonRequest(session, "routine.create", {
          agentId: assistant.id,
          name: "Morning brief",
          prompt: "Summarize today",
          schedule: { kind: "daily", time: "08:00", weekdays: null },
          timeZone: "UTC",
        });
        stub.plan = { kind: "stream", chunks: ["Two meetings today."] };
        await daemonRequest(session, "routine.run", { id: routine.id });
        const inboxName = await translate(session, "personal:inbox.heading");
        const row = {
          role: "button",
          name: /Morning brief/,
          within: { role: "region", name: inboxName },
        };
        await waitForRole(session, row, UI_TIMEOUT_MS);
        const [run] = await daemonRequest(session, "routine.runs", {
          routineId: routine.id,
        });
        check(
          run?.status === "succeeded" && run.sessionId !== state.homeSessionId,
          "the run used its own thread",
          run,
        );
        const source = {
          role: "button",
          name: await translate(session, "agent:peerMessage.fromRoutine", {
            name: "Morning brief",
          }),
        };
        await waitForRole(session, source, UI_TIMEOUT_MS);
        const home = await daemonRequest(session, "session.snapshot", {
          sessionId: state.homeSessionId,
        });
        const posted = home.messages.at(-1);
        check(
          posted?.role === "assistant" &&
            posted.content === "Two meetings today." &&
            posted.origin?.sessionId === run.sessionId,
          "the result is the latest message of the home thread",
          posted,
        );
        await clickByRole(session, source);
        await session.waitUntil(
          (prompt) =>
            [...document.querySelectorAll("article")].some((node) =>
              node.textContent.includes(prompt),
            ),
          "Summarize today",
          UI_TIMEOUT_MS,
        );
        await waitForNoRole(session, row, UI_TIMEOUT_MS);
        return { routine: routine.id, sessionId: run.sessionId };
      },
    ],
    [
      "the brief opens in the home thread, not in a dialog",
      async ({ session }) => {
        const language = await session.run(() => document.documentElement.lang);
        const resultsTitle = BRIEF_RESULTS_TITLE[language] ?? "Routine results";
        const briefButton = {
          role: "button",
          name: await translate(session, "personal:brief.open"),
        };
        await clickByRole(session, briefButton, UI_TIMEOUT_MS);
        await session.waitUntil(
          (heading) =>
            [...document.querySelectorAll("article")].some(
              (node) =>
                node.textContent.includes(heading) &&
                node.textContent.includes("Morning brief"),
            ),
          resultsTitle,
          UI_TIMEOUT_MS,
        );
        const dialogs = await queryAllByRole(session, { role: "dialog" });
        check(dialogs.length === 0, "the brief opens no dialog", dialogs);
        return {};
      },
    ],
    [
      "the next turn tells the assistant what was posted to its thread",
      async ({ session }) => {
        const defaultName = await translate(session, "personal:defaultName");
        await clickByRole(
          session,
          {
            role: "button",
            name: rowName(defaultName),
            within: {
              role: "region",
              name: await translate(session, "personal:roster.label"),
            },
          },
          UI_TIMEOUT_MS,
        );
        await session.waitUntil(
          (runPrompt) =>
            ![...document.querySelectorAll("article")].some((node) =>
              node.textContent.includes(runPrompt),
            ),
          "Summarize today",
          UI_TIMEOUT_MS,
        );
        stub.plan = { kind: "stream", chunks: ["The standup."] };
        const [composer] = await waitForRole(
          session,
          await composerQuery(session),
          UI_TIMEOUT_MS,
        );
        const before = stub.requests.length;
        await typeInto(session, composer, "Which meeting first?");
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "common:actions.send"),
        });
        await session.waitUntil(
          (reply) =>
            [...document.querySelectorAll("article")].some((node) =>
              node.textContent.includes(reply),
            ),
          "The standup.",
          UI_TIMEOUT_MS,
        );
        const request = JSON.stringify(
          stub.requests.slice(before).map((entry) => entry.body.messages),
        );
        check(
          request.includes("Two meetings today.") &&
            request.includes("Morning brief"),
          "the routine result reaches the model with its source",
          request.slice(-1200),
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
        for (const [label, text] of [
          ["personal:edit.instructions", "Plan workouts"],
          ["personal:edit.soul", "Speak briefly"],
        ]) {
          const [field] = await waitForRole(session, {
            role: "textbox",
            name: await translate(session, label),
            within: dialog,
          });
          await clickPoint(
            session,
            await centerOf(session, field.backendNodeId),
          );
          await session.send("Input.insertText", { text });
        }
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
        await waitForRole(
          session,
          {
            role: "textbox",
            name: await translate(session, "personal:thread.placeholder", {
              name: "Coach",
            }),
          },
          UI_TIMEOUT_MS,
        );
        await waitForRole(
          session,
          { role: "region", name: "Coach" },
          UI_TIMEOUT_MS,
        );
        const [composer] = await waitForRole(session, {
          role: "textbox",
          name: await translate(session, "personal:thread.placeholder", {
            name: "Coach",
          }),
        });
        const composerTop = (await centerOf(session, composer.backendNodeId)).y;
        const viewport = await session.run(() => window.innerHeight);
        check(
          composerTop > viewport * 0.7,
          "an empty thread shows the intro with the composer docked below",
          { composerTop, viewport },
        );
        const coach = (await personas(session)).find(
          (agent) => agent.role.name === "Coach",
        );
        check(
          coach && !coach.isDefault && coach.role.modelId === "personal-model",
          "the new assistant starts from the default assistant's model",
          coach,
        );
        check(
          coach.role.agentId === "pi" &&
            coach.role.instructions === "Plan workouts" &&
            coach.soul === "Speak briefly",
          "the edit dialog saves the assistant's instructions and persona on pi",
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
