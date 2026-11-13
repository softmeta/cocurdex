import { createRequire } from "node:module";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import { clickByRole, queryAllByRole, waitForRole } from "./lib/locate.mjs";
import { openSidebarForm, translate } from "./lib/navigate.mjs";

const require = createRequire(
  new URL("../harness/package.json", import.meta.url),
);
const { tsImport } = await import(require.resolve("tsx/esm/api"));
const { startStubLlmServer } = await tsImport(
  require.resolve("@cocurdex/test-harness/helpers/llm-stub"),
  import.meta.url,
);
const { CHAT_WORKSPACE_ID, createProviderSnapshotForModel } = await tsImport(
  require.resolve("@cocurdex/shared"),
  import.meta.url,
);

const TITLE = "Chat wording check";
const REPLY = "Chat wording reply finished.";
const STALLED_PART = "Checking on the helpers.";
const UI_TIMEOUT_MS = 30_000;
const args = readScenarioArgs();
let stub;

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function liveLabelText() {
  const timeline = document.querySelector("[data-testid=chat-timeline]");
  return timeline?.textContent ?? "";
}

runScenario("chat-mode-labels", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    stub = await startStubLlmServer();
    const now = new Date().toISOString();
    const provider = {
      id: "chat-labels-scenario",
      name: "Chat labels scenario",
      baseUrl: stub.baseUrl,
      enabled: true,
      apiKeySecretId: null,
      headersJson: JSON.stringify({ Authorization: "Bearer synthetic-key" }),
      createdAt: now,
      updatedAt: now,
    };
    const model = {
      providerId: provider.id,
      modelId: "chat-labels-model",
      name: "Chat labels model",
      api: "openai-completions",
      enabled: true,
      source: "manual",
      capabilities: ["chat", "agent"],
      createdAt: now,
      updatedAt: now,
    };
    await daemonRequest(session, "provider.config.save", { config: provider });
    await daemonRequest(session, "provider.model.save", { model });
    const configured = await daemonRequest(session, "session.configure", {
      id: crypto.randomUUID(),
      workspaceId: CHAT_WORKSPACE_ID,
      sessionKind: "chat",
      title: TITLE,
      agentType: "pi",
      writeMode: "read-only",
      sessionModeId: null,
      providerSnapshot: createProviderSnapshotForModel({ provider, model }),
    });
    return {
      sessionId: configured.id,
      labels: {
        attach: await translate(session, "common:actions.attach"),
        skills: await translate(session, "sessions:composer.attachMenu.skills"),
        thinking: await translate(session, "agent:activity.thinking"),
        working: await translate(session, "agent:activity.planning"),
      },
    };
  },
  steps: [
    [
      "a pending chat turn reads as thinking, not working",
      async ({ session, sessionId, labels }) => {
        await openSidebarForm(session, "chat:sidebar.title");
        await clickByRole(
          session,
          { role: "button", name: new RegExp(`^${TITLE}`) },
          UI_TIMEOUT_MS,
        );
        const gate = deferred();
        stub.plan = {
          kind: "script",
          turns: [{ text: [gate.promise, REPLY] }],
        };
        await daemonRequest(session, "session.send", {
          sessionId,
          messageId: crypto.randomUUID(),
          content: "Say something short.",
          attachments: [],
        });
        await stub.nextRequest();
        await session.waitUntil(
          (text) =>
            document
              .querySelector("[data-testid=chat-timeline]")
              ?.textContent?.includes(text),
          labels.thinking,
          UI_TIMEOUT_MS,
        );
        const pending = await session.run(liveLabelText);
        gate.resolve();
        await session.waitUntil(
          (text) => document.body.textContent.includes(text),
          REPLY,
          UI_TIMEOUT_MS,
        );
        check(
          !pending.includes(labels.working),
          "pending chat turn shows work wording",
          { pending },
        );
        return { pending: labels.thinking };
      },
    ],
    [
      "a reply that stops arriving mid-run reads as thinking again",
      async ({ session, sessionId, labels }) => {
        const gate = deferred();
        stub.plan = {
          kind: "script",
          turns: [{ text: [STALLED_PART, gate.promise, REPLY] }],
        };
        await daemonRequest(session, "session.send", {
          sessionId,
          messageId: crypto.randomUUID(),
          content: "Start, then pause.",
          attachments: [],
        });
        await stub.nextRequest();
        await session.waitUntil(
          (text) => document.body.textContent.includes(text),
          STALLED_PART,
          UI_TIMEOUT_MS,
        );
        await session.waitUntil(
          ([part, thinking]) => {
            const text =
              document.querySelector("[data-testid=chat-timeline]")
                ?.textContent ?? "";
            return text.includes(part) && text.includes(thinking);
          },
          [STALLED_PART, labels.thinking],
          UI_TIMEOUT_MS,
        );
        gate.resolve();
        await session.waitUntil(
          (text) => document.body.textContent.includes(text),
          REPLY,
          UI_TIMEOUT_MS,
        );
        return { stalled: labels.thinking };
      },
    ],
    [
      "the chat attach menu offers no skills",
      async ({ session, labels }) => {
        await clickByRole(
          session,
          { role: "button", name: labels.attach },
          UI_TIMEOUT_MS,
        );
        await waitForRole(
          session,
          { role: "menuitem", name: labels.attach },
          UI_TIMEOUT_MS,
        );
        const skills = await queryAllByRole(session, {
          role: "menuitem",
          name: labels.skills,
        });
        await session.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        });
        check(skills.length === 0, "chat attach menu lists skills", {
          count: skills.length,
        });
        return { skillEntries: skills.length };
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
    await stub?.close();
    await openSidebarForm(session, "sessions:sidebar.workspacesGroup");
    return {};
  },
});
