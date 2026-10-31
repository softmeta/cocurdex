import { translateFor } from "./i18n.mjs";
import {
  centerOf,
  clickByRole,
  clickPoint,
  queryAllByRole,
  waitForRole,
} from "./locate.mjs";

const NAVIGATION_TIMEOUT_MS = 30_000;

const PANEL_VIEW_KEYS = {
  files: "editor:actions.showEditor",
  git: "editor:actions.showGitChanges",
  terminal: "editor:actions.showTerminal",
  browser: "editor:actions.showBrowser",
  pdf: "editor:actions.showPdf",
  notes: "editor:actions.showNotes",
  issues: "editor:actions.showIssues",
  decks: "editor:actions.showDecks",
};

export const BODY_EDITOR_IN_DIALOG = '[role="dialog"] .md-body-prose';

export async function translate(session, key, options) {
  const language = await session.run(() => document.documentElement.lang);
  return translateFor(language, key, options);
}

export async function openEditorPanel(session) {
  const [open, close] = await Promise.all(
    ["editor:actions.openEditorPanel", "editor:actions.closeEditorPanel"].map(
      (key) => translate(session, key),
    ),
  );
  const [toggle] = await waitForRole(
    session,
    { role: "button", name: new RegExp(`^(${open}|${close})$`) },
    NAVIGATION_TIMEOUT_MS,
  );
  if (toggle.name === close) return { wasOpen: true };
  await clickByRole(session, { role: "button", name: open });
  await waitForRole(
    session,
    { role: "button", name: close },
    NAVIGATION_TIMEOUT_MS,
  );
  return { wasOpen: false };
}

export async function closeEditorPanel(session) {
  const [open, close] = await Promise.all(
    ["editor:actions.openEditorPanel", "editor:actions.closeEditorPanel"].map(
      (key) => translate(session, key),
    ),
  );
  const [closeButton] = await queryAllByRole(session, {
    role: "button",
    name: close,
  });
  if (closeButton) {
    await clickPoint(
      session,
      await centerOf(session, closeButton.backendNodeId),
    );
  }
  await waitForRole(
    session,
    { role: "button", name: open },
    NAVIGATION_TIMEOUT_MS,
  );
}

export async function showPanelView(session, view) {
  const key = PANEL_VIEW_KEYS[view];
  if (!key) throw new Error(`Unknown panel view "${view}"`);
  const panel = await openEditorPanel(session);
  await clickByRole(
    session,
    { role: "button", name: await translate(session, key) },
    NAVIGATION_TIMEOUT_MS,
  );
  return panel;
}

export async function openNote(session, title) {
  await clickByRole(
    session,
    { role: "button", name: title },
    NAVIGATION_TIMEOUT_MS,
  );
  await session.waitUntil(
    (text) =>
      [...document.querySelectorAll("[data-note-id][data-active]")].some(
        (row) => row.textContent.trim() === text,
      ) && Boolean(document.querySelector(".md-body-prose")),
    title,
    NAVIGATION_TIMEOUT_MS,
  );
}

export async function openNewIssueDialog(session) {
  await showPanelView(session, "issues");
  const query = {
    role: "button",
    name: await translate(session, "issues:board.addCard"),
  };
  await waitForRole(session, query, NAVIGATION_TIMEOUT_MS);
  const [firstColumn] = await queryAllByRole(session, query);
  await clickPoint(session, await centerOf(session, firstColumn.backendNodeId));
  await session.waitUntil(
    (selector) => Boolean(document.querySelector(selector)?.editor),
    BODY_EDITOR_IN_DIALOG,
    NAVIGATION_TIMEOUT_MS,
  );
}

export async function openSettingsSection(session, section) {
  const sectionName = await translate(session, `settings:sections.${section}`);
  const sectionButton = {
    role: "button",
    name: sectionName,
    within: { role: "list" },
  };
  const [visible] = await queryAllByRole(session, sectionButton);
  if (!visible) {
    await clickByRole(
      session,
      {
        role: "button",
        name: await translate(session, "sessions:sidebar.settings"),
      },
      NAVIGATION_TIMEOUT_MS,
    );
  }
  await clickByRole(session, sectionButton, NAVIGATION_TIMEOUT_MS);
  await waitForRole(
    session,
    { role: "heading", name: sectionName },
    NAVIGATION_TIMEOUT_MS,
  );
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function openExecutionTree(session, sessionTitle) {
  await clickByRole(
    session,
    { role: "button", name: new RegExp(`^${escapeRegExp(sessionTitle)}\\b`) },
    NAVIGATION_TIMEOUT_MS,
    "right",
  );
  await clickByRole(
    session,
    {
      role: "menuitem",
      name: await translate(session, "sessions:sidebar.executionTree"),
    },
    NAVIGATION_TIMEOUT_MS,
  );
  await waitForRole(
    session,
    {
      role: "dialog",
      name: await translate(session, "sessions:executionTree.title"),
    },
    NAVIGATION_TIMEOUT_MS,
  );
}
