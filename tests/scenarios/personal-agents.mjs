import { writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./lib/appearance.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import {
  centerOf,
  clickByRole,
  clickPoint,
  queryAllByRole,
  waitForNoRole,
  waitForRole,
} from "./lib/locate.mjs";
import {
  closeEditorPanel,
  openAssistantsTab,
  showPanelView,
  translate,
} from "./lib/navigate.mjs";
import { assistantApplicationsStep } from "./lib/personal-applications.mjs";
import {
  assistantFilesStep,
  assistantPanelsStep,
  assistantWorkStep,
} from "./lib/personal-overview.mjs";
import { assistantManagedPdfStep } from "./lib/personal-pdf-upload.mjs";

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
const COACH_GREETING =
  "Hi, I'm Coach! I can plan your workouts and check in on your week. What are you training for?";
const FIRST_GREETING =
  "Hey, I'm your new assistant. I can keep your day in view and nudge you on time. What's on your plate?";
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
      name: state.assistantName,
    }),
    exact: false,
  };
}

async function waitForMessages(session, sessionId, predicate) {
  const deadline = Date.now() + UI_TIMEOUT_MS;
  for (;;) {
    const snapshot = await daemonRequest(session, "session.snapshot", {
      sessionId,
    });
    if (predicate(snapshot.messages) || Date.now() > deadline) return snapshot;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
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
  open: () => openScenarioApp(args, { isolated: true }),
  setup: async ({ session, workspaceRoot }) => {
    state.outputPath = path.join(workspaceRoot, "assistant-result.txt");
    await writeFile(state.outputPath, "Assistant result content", "utf8");
    stub = await startStubLlmServer();
    await seedStubModel(session);
    return {};
  },
  steps: [
    [
      "an empty assistants tab invites the user to create the first assistant",
      async ({ session }) => {
        await openAssistantsTab(session);
        check(
          (await personas(session)).length === 0,
          "no assistant exists until the user creates one",
        );
        const invite = {
          role: "region",
          name: await translate(session, "personal:empty.title"),
        };
        await waitForRole(session, invite, UI_TIMEOUT_MS);
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "personal:roster.new"),
          within: invite,
        });
        const dialog = {
          role: "dialog",
          name: await translate(session, "personal:edit.title"),
        };
        await waitForRole(session, dialog, UI_TIMEOUT_MS);
        check(
          (await personas(session)).length === 0,
          "opening the dialog creates nothing until it is saved",
        );
        stub.plan = { kind: "stream", chunks: [FIRST_GREETING] };
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "settings:agentRoles.save"),
          within: dialog,
        });
        await waitForNoRole(session, dialog, UI_TIMEOUT_MS);
        const [assistant] = await personas(session);
        check(
          assistant?.isDefault,
          "the first assistant becomes the default",
          assistant,
        );
        await waitForNoRole(session, invite, UI_TIMEOUT_MS);
        const selected = await session.run(
          (id) =>
            document
              .querySelector(`[data-personal-agent-id="${id}"]`)
              ?.hasAttribute("data-active") ?? false,
          assistant.id,
        );
        check(selected, "the new assistant row is selected");
        const opening = await waitForMessages(
          session,
          assistant.homeSessionId,
          (messages) => messages.length > 0,
        );
        const [greeting] = opening.messages;
        check(
          opening.messages.length === 1 &&
            greeting.origin?.kind === "greeting" &&
            greeting.content === FIRST_GREETING,
          "the new assistant greets in its own words once saved",
          opening.messages,
        );
        await session.waitUntil(
          (text) =>
            [...document.querySelectorAll("article")].some((node) =>
              node.textContent.includes(text),
            ),
          FIRST_GREETING,
          UI_TIMEOUT_MS,
        );
        state.assistantName = assistant.role.name;
        state.homeSessionId = assistant.homeSessionId;
        state.personaId = assistant.id;
        return { homeSessionId: assistant.homeSessionId };
      },
    ],
    [
      "the assistant header opens the overview after following the pointer",
      async ({ session }) => {
        await closeEditorPanel(session);
        const overviewLabel = await translate(
          session,
          "editor:actions.showAssistantOverview",
        );
        const trigger = { role: "button", name: overviewLabel };
        const [button] = await waitForRole(session, trigger);
        const point = await centerOf(session, button.backendNodeId);
        const movePointer = (x, y) =>
          session.send("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x,
            y,
          });
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          await movePointer(point.x, point.y + 80);
          const rest = await session.run(async ({ x, y }) => {
            const button = document.elementFromPoint(x, y).closest("button");
            await Promise.all(
              button
                .getAnimations({ subtree: true })
                .map((animation) => animation.finished),
            );
            return {
              background: getComputedStyle(button).backgroundColor,
              width: button.getBoundingClientRect().width,
            };
          }, point);
          await movePointer(point.x, point.y);
          await session.waitUntil(
            ({ x, y, rest }) => {
              const button = document.elementFromPoint(x, y)?.closest("button");
              if (!button) return false;
              const avatar = button.querySelector("[data-avatar]");
              return (
                Number(avatar?.style.getPropertyValue("--avatar-look-x")) > 0 &&
                getComputedStyle(button).backgroundColor !== rest.background &&
                button.getBoundingClientRect().width > rest.width
              );
            },
            { ...point, rest },
            UI_TIMEOUT_MS,
          );
        }
        await session.send("Emulation.setEmulatedMedia", {
          features: [
            { name: "prefers-reduced-motion", value: "no-preference" },
          ],
        });
        const panelMotion = session.run(
          () =>
            new Promise((resolve) => {
              const observer = new MutationObserver(() => {
                const panel = document.querySelector(
                  '[data-testid="shell-right-panel"]',
                );
                if (!panel) return;
                observer.disconnect();
                requestAnimationFrame(async () => {
                  const chat = document.querySelector(
                    '[data-testid="shell-chat-surface"]',
                  );
                  const gap = () =>
                    panel.getBoundingClientRect().left -
                    (chat.getBoundingClientRect().right -
                      Number.parseFloat(
                        getComputedStyle(chat).paddingInlineEnd,
                      ));
                  const initial = panel.getBoundingClientRect().left;
                  let maximumGap = Math.abs(gap());
                  const animations = [
                    ...panel.getAnimations(),
                    ...panel.parentElement.getAnimations(),
                  ];
                  while (
                    animations.some(({ playState }) => playState === "running")
                  ) {
                    await new Promise(requestAnimationFrame);
                    maximumGap = Math.max(maximumGap, Math.abs(gap()));
                  }
                  resolve({
                    initial,
                    settled: panel.getBoundingClientRect().left,
                    maximumGap,
                  });
                });
              });
              observer.observe(document.querySelector("main"), {
                childList: true,
              });
            }),
        );
        const [, motion] = await Promise.all([
          clickByRole(session, trigger),
          panelMotion,
        ]);
        await waitForRole(session, { role: "region", name: overviewLabel });
        check(
          motion.initial > motion.settled,
          "the overview slides in from the right",
          motion,
        );
        check(
          motion.maximumGap <= 1,
          "the chat edge tracks the overview throughout the opening",
          motion,
        );
        await clearColorScheme(session);
        return { motion };
      },
    ],
    assistantPanelsStep(),
    assistantApplicationsStep(state),
    [
      "the assistant answers in its home thread",
      async ({ session }) => {
        const { homeSessionId } = state;
        const noteBody = "Rest for one minute between sets.";
        const note = await daemonRequest(session, "note.create", {
          title: "Workout plan",
          bodyMarkdown: noteBody,
        });
        stub.plan = {
          kind: "stream",
          chunks: [
            "Ten push-ups,",
            ` then stretch.\n\n[Assistant result](${state.outputPath})\n\n[Workout details](<cocurdex://note/${note.id}>)`,
          ],
        };
        const [composer] = await waitForRole(
          session,
          await composerQuery(session),
          UI_TIMEOUT_MS,
        );
        await typeInto(session, composer, "What needs my attention today?");
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "common:actions.send"),
        });
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
          contents.includes("What needs my attention today?") &&
            contents.some((content) => content.startsWith(REPLY)),
          "the exchange is stored in the assistant's home thread",
          contents,
        );
        const bubbleColors = {};
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          bubbleColors[theme] = await session.run((reply) => {
            const article = [...document.querySelectorAll("article")].find(
              (node) => node.textContent.includes(reply),
            );
            return getComputedStyle(article).backgroundColor;
          }, REPLY);
          check(
            bubbleColors[theme] !== "rgba(0, 0, 0, 0)",
            "the assistant reply has a bubble background",
            { theme, color: bubbleColors[theme] },
          );
        }
        await clearColorScheme(session);
        await clickByRole(
          session,
          { role: "link", name: "Workout details" },
          UI_TIMEOUT_MS,
        );
        await session.waitUntil(
          (body) => document.body.textContent.includes(body),
          noteBody,
          UI_TIMEOUT_MS,
        );
        return { bubbleColors };
      },
    ],
    assistantFilesStep(),
    assistantManagedPdfStep(state, () => stub),
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
        const source = {
          role: "button",
          name: await translate(session, "agent:peerMessage.fromRoutine", {
            name: "Morning brief",
          }),
        };
        await waitForRole(session, source, UI_TIMEOUT_MS);
        const [run] = await daemonRequest(session, "routine.runs", {
          routineId: routine.id,
        });
        check(
          run?.status === "succeeded" && run.sessionId !== state.homeSessionId,
          "the run used its own thread",
          run,
        );
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
        await clickByRole(
          session,
          {
            role: "button",
            name: rowName(state.assistantName),
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
    assistantWorkStep(state, () => stub),
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
        check(
          (await personas(session)).length === 1,
          "a new assistant does not exist until its edit dialog is saved",
        );
        stub.plan = { kind: "stream", chunks: [COACH_GREETING] };
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
        const saved = (await personas(session)).find(
          (agent) => agent.role.name === "Coach",
        );
        const greeted = await waitForMessages(
          session,
          saved.homeSessionId,
          (messages) => messages.length > 0,
        );
        check(
          greeted.messages[0]?.content === COACH_GREETING,
          "the saved assistant greets once its edit dialog closes",
          {
            messages: greeted.messages,
            requests: stub.requests.length,
            last: JSON.stringify(stub.requests.at(-1) ?? null).slice(0, 300),
          },
        );
        await session.waitUntil(
          (greeting) =>
            [...document.querySelectorAll("article")].some((node) =>
              node.textContent.includes(greeting),
            ),
          COACH_GREETING,
          UI_TIMEOUT_MS,
        );
        const greetingRequest = JSON.stringify(stub.requests.at(-1) ?? null);
        check(
          greetingRequest.includes("Coach") &&
            greetingRequest.includes("Plan workouts"),
          "the assistant writes its greeting with its own model, name, and instructions",
          greetingRequest.slice(0, 400),
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
          "a new thread shows the greeting with the composer docked below",
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
        await showPanelView(session, "overview");
        const overview = {
          role: "region",
          name: await translate(
            session,
            "editor:actions.showAssistantOverview",
          ),
        };
        await waitForRole(session, {
          role: "region",
          name: await translate(session, "personal:overview.work"),
          within: overview,
        });
        const foreignWork = await queryAllByRole(session, {
          role: "button",
          name: /Overview code review/,
          within: overview,
        });
        const foreignRoutines = await queryAllByRole(session, {
          role: "button",
          name: /Morning brief/,
          within: overview,
        });
        check(
          foreignWork.length === 0 && foreignRoutines.length === 0,
          "a new assistant's overview excludes another assistant's work and routines",
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
      "messaging from the empty assistants tab creates an assistant and sends to it",
      async ({ session }) => {
        for (const agent of await personas(session)) {
          await daemonRequest(session, "personalAgent.delete", {
            id: agent.id,
          });
        }
        const invite = {
          role: "region",
          name: await translate(session, "personal:empty.title"),
        };
        await waitForRole(session, invite, UI_TIMEOUT_MS);
        const [composer] = await waitForRole(
          session,
          {
            role: "textbox",
            name: await translate(session, "personal:empty.placeholder"),
            exact: false,
          },
          UI_TIMEOUT_MS,
        );
        stub.plan = { kind: "stream", chunks: ["On it."] };
        await typeInto(session, composer, "Plan my week");
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "common:actions.send"),
        });
        await waitForNoRole(session, invite, UI_TIMEOUT_MS);
        const [assistant] = await personas(session);
        check(assistant?.isDefault, "the message created a default assistant");
        const thread = await waitForMessages(
          session,
          assistant.homeSessionId,
          (messages) =>
            messages.some((message) => message.role === "assistant"),
        );
        check(
          thread.messages[0]?.content === "Plan my week" &&
            !thread.messages.some((m) => m.origin?.kind === "greeting"),
          "the user's message opens the thread without a greeting",
          thread.messages.map(({ role, content, origin }) => ({
            role,
            content,
            origin,
          })),
        );
        await session.waitUntil(
          (text) =>
            [...document.querySelectorAll("article")].some((node) =>
              node.textContent.includes(text),
            ),
          "On it.",
          UI_TIMEOUT_MS,
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
