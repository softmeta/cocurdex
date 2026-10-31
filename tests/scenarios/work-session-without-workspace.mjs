import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import { clickByRole, queryAllByRole, waitForRole } from "./lib/locate.mjs";
import { translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const APP_READY_TIMEOUT_MS = 120_000;
const PROMPT = "Sketch the release notes";

const args = readScenarioArgs();
if (args.port) {
  console.error(
    "work-session-without-workspace runs only on an isolated instance; omit --port",
  );
  process.exit(2);
}

async function waitForComposer(session) {
  await session.waitUntil(
    () => Boolean(window.desktopApi),
    null,
    APP_READY_TIMEOUT_MS,
  );
  await session.waitUntil(
    () => Boolean(document.querySelector('[role="textbox"]')),
    null,
    APP_READY_TIMEOUT_MS,
  );
}

async function seedProvider(session) {
  const now = new Date().toISOString();
  await daemonRequest(session, "provider.config.save", {
    config: {
      id: "scenario-provider",
      name: "Scenario Provider",
      baseUrl: "http://127.0.0.1:9",
      enabled: true,
      apiKeySecretId: null,
      headersJson: null,
      createdAt: now,
      updatedAt: now,
    },
  });
  await daemonRequest(session, "provider.model.save", {
    model: {
      providerId: "scenario-provider",
      modelId: "scenario-model",
      name: "Scenario Model",
      api: "openai-completions",
      enabled: true,
      source: "manual",
      contextLimit: 8192,
      outputLimit: 1024,
      capabilities: [],
      createdAt: now,
      updatedAt: now,
    },
  });
}

async function removeWorkWorkspaces(session) {
  await waitForComposer(session);
  await seedProvider(session);
  const workspaces = await daemonRequest(session, "workspace.list");
  for (const workspace of workspaces) {
    if (workspace.id === "chat") continue;
    await daemonRequest(session, "workspace.delete", {
      workspaceId: workspace.id,
    });
  }
  await session.run(() => {
    localStorage.clear();
    return true;
  });
  await session.reload();
}

async function sendButton(session) {
  const label = await translate(session, "common:actions.send");
  return session.run((label) => {
    const button = [...document.querySelectorAll("button")].find(
      (element) => element.getAttribute("aria-label") === label,
    );
    return button ? { disabled: button.disabled } : null;
  }, label);
}

runScenario("work-session-without-workspace", {
  open: () => openScenarioApp(args, { isolated: true }),
  setup: async ({ session }) => {
    await removeWorkWorkspaces(session);
    const placeholder = await translate(
      session,
      "sessions:composer.openWorkspaceFirst",
    );
    await waitForRole(
      session,
      { role: "textbox", name: placeholder },
      APP_READY_TIMEOUT_MS,
    );
    return { placeholder };
  },
  steps: [
    [
      "the work composer asks for a folder before sending",
      async ({ session, placeholder }) => {
        const [composer] = await queryAllByRole(session, {
          role: "textbox",
          name: placeholder,
        });
        check(composer, "work composer does not explain it needs a folder");
        const folderButton = {
          role: "button",
          name: await translate(session, "sessions:workspace.openFolder"),
        };
        const [openFolder] = await queryAllByRole(session, folderButton);
        check(openFolder, "no folder picker next to the work composer");
        return { placeholder };
      },
    ],
    [
      "a prompt enables the send button without a workspace",
      async ({ session, placeholder }) => {
        await clickByRole(session, { role: "textbox", name: placeholder });
        await session.send("Input.insertText", { text: PROMPT });
        await session.waitUntil(
          () =>
            document
              .querySelector('[contenteditable="true"]')
              ?.innerText.includes("Sketch"),
          null,
          UI_TIMEOUT_MS,
        );
        const button = await sendButton(session);
        check(button, "composer has no send button");
        check(
          !button.disabled,
          "send stays disabled without a workspace",
          button,
        );
        return { button };
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
  teardown: async () => ({}),
});
