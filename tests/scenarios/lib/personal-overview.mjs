import { check } from "./app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./appearance.mjs";
import { daemonRequest } from "./daemon-rpc.mjs";
import { clickByRole, queryAllByRole, waitForRole } from "./locate.mjs";
import { openAssistantsTab, showPanelView, translate } from "./navigate.mjs";

const UI_TIMEOUT_MS = 30_000;

function rowName(name) {
  return new RegExp(`^${name}\\s`);
}

export function assistantPanelsStep() {
  return [
    "assistant panels expose personal tools and conversation files in both themes",
    async ({ session }) => {
      for (const theme of ["light", "dark"]) {
        await emulateColorScheme(session, theme);
        await showPanelView(session, "overview");
        await waitForRole(session, {
          role: "region",
          name: await translate(
            session,
            "editor:actions.showAssistantOverview",
          ),
        });
        await showPanelView(session, "notes");
        const group = {
          role: "group",
          name: await translate(session, "editor:actions.panelViews"),
        };
        for (const key of [
          "showGitChanges",
          "showTerminal",
          "showBrowser",
          "showDecks",
          "showEditor",
        ]) {
          const tabs = await queryAllByRole(session, {
            role: "button",
            name: await translate(session, `editor:actions.${key}`),
            within: group,
          });
          check(tabs.length === 0, `${key} is not a primary assistant tab`);
        }
        for (const view of ["memory", "issues", "routines", "files"])
          await showPanelView(session, view);
        await waitForRole(session, {
          role: "region",
          name: await translate(session, "editor:actions.conversationFiles"),
        });
        const roots = await session.run(
          () =>
            document.querySelectorAll(
              '[data-testid="editor-sidebar-pane"] [role="tree"]',
            ).length,
        );
        check(roots === 0, "assistant files do not inherit a workspace tree");
      }
      await clearColorScheme(session);
      return { themes: ["light", "dark"] };
    },
  ];
}

export function assistantFilesStep() {
  return [
    "assistant output opens from the thread and stays reachable in conversation files",
    async ({ session }) => {
      await clickByRole(
        session,
        { role: "link", name: "Assistant result" },
        UI_TIMEOUT_MS,
      );
      await showPanelView(session, "files");
      const region = {
        role: "region",
        name: await translate(session, "editor:actions.conversationFiles"),
      };
      await clickByRole(session, {
        role: "button",
        name: "assistant-result.txt",
        within: region,
      });
      await session.waitUntil(
        () =>
          [...document.querySelectorAll(".monaco-editor")].some((node) =>
            node.textContent
              .replace(/\u00a0/g, " ")
              .includes("Assistant result content"),
          ),
        null,
        UI_TIMEOUT_MS,
      );
      return {};
    },
  ];
}

export function assistantWorkStep(state, getStub) {
  return [
    "the overview links this assistant's delegated work and routine configuration",
    async ({ session }) => {
      const role = await daemonRequest(session, "agentRole.save", {
        name: "Overview builder",
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
      });
      getStub().plan = { kind: "stream", chunks: ["Overview work complete."] };
      const work = await daemonRequest(session, "personalAgent.work.start", {
        personaId: state.personaId,
        workspace: "scenario-workspace",
        agentRole: role.id,
        title: "Overview code review",
        prompt: "Inspect the synthetic storefront",
      });
      state.workSessionId = work.sessionId;
      await showPanelView(session, "overview");
      const overview = {
        role: "region",
        name: await translate(session, "editor:actions.showAssistantOverview"),
      };
      await clickByRole(
        session,
        { role: "button", name: /Overview code review/, within: overview },
        UI_TIMEOUT_MS,
      );
      await session.waitUntil(
        () =>
          [...document.querySelectorAll("article")].some((node) =>
            node.textContent.includes("Inspect the synthetic storefront"),
          ),
        null,
        UI_TIMEOUT_MS,
      );
      await openAssistantsTab(session);
      await clickByRole(session, {
        role: "button",
        name: rowName(state.assistantName),
        within: {
          role: "region",
          name: await translate(session, "personal:roster.label"),
        },
      });
      await showPanelView(session, "overview");
      await clickByRole(session, {
        role: "button",
        name: /Morning brief/,
        within: overview,
      });
      await waitForRole(
        session,
        {
          role: "textbox",
          name: await translate(session, "personal:routines.name"),
        },
        UI_TIMEOUT_MS,
      );
      await waitForRole(
        session,
        { role: "form", name: "Morning brief" },
        UI_TIMEOUT_MS,
      );
      return { workSessionId: work.sessionId };
    },
  ];
}
