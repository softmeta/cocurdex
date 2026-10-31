import path from "node:path";
import { fileURLToPath } from "node:url";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { openWorkspaceFile } from "./lib/file-tree.mjs";
import { closeEditorPanel, showPanelView, translate } from "./lib/navigate.mjs";

const MARKDOWN_FIXTURE = fileURLToPath(
  new URL("./fixtures/readme-sample.md", import.meta.url),
);
const UI_TIMEOUT_MS = 30_000;

const args = readScenarioArgs();

async function restoreEditorPanel(session, fileName, panelWasOpen) {
  const closeLabel = await translate(session, "editor:actions.closeFile", {
    fileName,
  });
  await session.run((label) => {
    window.__scenario.byLabel(label)?.click();
    return true;
  }, closeLabel);
  if (!panelWasOpen) await closeEditorPanel(session);
}

function readModeToggle() {
  const bar = document.querySelector('[data-testid="editor-tabs-bar"]');
  const toggle = bar?.querySelector("button[aria-pressed]");
  if (!toggle) return null;
  return {
    label: toggle.textContent.trim(),
    sourceShown: toggle.getAttribute("aria-pressed") === "true",
  };
}

async function clickModeToggle(session, expectedLabel) {
  await session.run(() => {
    document
      .querySelector('[data-testid="editor-tabs-bar"] button[aria-pressed]')
      .click();
    return true;
  });
  await session.waitUntil(
    (label) =>
      document
        .querySelector('[data-testid="editor-tabs-bar"] button[aria-pressed]')
        ?.textContent.trim() === label,
    expectedLabel,
    UI_TIMEOUT_MS,
  );
  return session.run(readModeToggle);
}

runScenario("markdown-preview", {
  open: () => openScenarioApp(args, { fixtures: [MARKDOWN_FIXTURE] }),
  async setup({ session }) {
    const { wasOpen: panelWasOpen } = await showPanelView(session, "files");
    await openWorkspaceFile(session, path.basename(MARKDOWN_FIXTURE));
    await session.waitUntil(
      () =>
        Boolean(
          document.querySelector(
            '[data-testid="editor-tabs-bar"] button[aria-pressed]',
          ),
        ),
      null,
      UI_TIMEOUT_MS,
    );
    const labels = {
      preview: await translate(session, "editor:actions.preview"),
      source: await translate(session, "editor:actions.source"),
    };
    return { labels, panelWasOpen };
  },
  steps: [
    [
      "read-only source offers preview",
      async ({ session, labels }) => {
        const toggle = await session.run(readModeToggle);
        check(toggle?.label === labels.preview, "initial label", toggle);
        check(toggle.sourceShown, "source mode pressed", toggle);
        return toggle;
      },
    ],
    [
      "preview offers source, never edit",
      async ({ session, labels }) => {
        const toggle = await clickModeToggle(session, labels.source);
        check(!toggle.sourceShown, "preview mode not pressed", toggle);
        return toggle;
      },
    ],
    [
      "toggling back restores source",
      async ({ session, labels }) => {
        const toggle = await clickModeToggle(session, labels.preview);
        check(toggle.sourceShown, "source mode pressed again", toggle);
        return toggle;
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
  async teardown({ session, isolated, panelWasOpen }) {
    if (isolated) return { restored: "isolated instance discarded" };
    await restoreEditorPanel(
      session,
      path.basename(MARKDOWN_FIXTURE),
      panelWasOpen,
    );
    return { restored: "closed the file and the panel the scenario opened" };
  },
});
