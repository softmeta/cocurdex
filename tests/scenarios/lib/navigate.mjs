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
  overview: "editor:actions.showAssistantOverview",
  files: "editor:actions.showEditor",
  git: "editor:actions.showGitChanges",
  terminal: "editor:actions.showTerminal",
  browser: "editor:actions.showBrowser",
  pdf: "editor:actions.showPdf",
  notes: "editor:actions.showNotes",
  issues: "editor:actions.showIssues",
  memory: "editor:actions.showMemory",
  routines: "editor:actions.showRoutines",
  decks: "editor:actions.showDecks",
};

const RAIL_APPS = new Set(["issues", "notes"]);
const RAIL_MORE_APPS = new Set(["decks", "routines", "memory"]);

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
  if (RAIL_APPS.has(view) || RAIL_MORE_APPS.has(view)) {
    await openRailApp(session, view);
    return { wasOpen: true };
  }
  await leaveRailApp(session);
  const panel = await openEditorPanel(session);
  const group = {
    role: "group",
    name: await translate(session, "editor:actions.panelViews"),
  };
  let name = await translate(session, key);
  const [more] = await queryAllByRole(session, {
    role: "button",
    name: await translate(session, "editor:actions.moreViews"),
  });
  const [overview] = await queryAllByRole(session, {
    role: "button",
    name: await translate(session, PANEL_VIEW_KEYS.overview),
    within: group,
  });
  if (overview && view === "files")
    name = await translate(session, "editor:actions.conversationFiles");
  const [tab] = await queryAllByRole(session, {
    role: "button",
    name,
    within: group,
  });
  if (!tab && more) {
    await clickByRole(session, { role: "button", name: more.name });
    await clickByRole(
      session,
      { role: "menuitem", name },
      NAVIGATION_TIMEOUT_MS,
    );
  } else {
    await clickByRole(
      session,
      { role: "button", name, within: group },
      NAVIGATION_TIMEOUT_MS,
    );
  }
  return panel;
}

export async function openNote(session, title, { editable = false } = {}) {
  await clickByRole(
    session,
    { role: "button", name: title },
    NAVIGATION_TIMEOUT_MS,
  );
  await session.waitUntil(
    (text) => {
      const row = [
        ...document.querySelectorAll("[data-note-id][data-active]"),
      ].find((candidate) => candidate.textContent.trim() === text);
      const noteId = row?.getAttribute("data-note-id");
      return Boolean(
        noteId &&
          document.querySelector(
            `[data-open-note-id="${CSS.escape(noteId)}"] .md-body-prose`,
          ),
      );
    },
    title,
    NAVIGATION_TIMEOUT_MS,
  );
  if (editable) await makeNoteEditable(session);
}

async function makeNoteEditable(session) {
  const name = await translate(session, "notes:editor.readOnly");
  const editable = () =>
    document
      .querySelector(".md-body-prose")
      ?.getAttribute("contenteditable") === "true";
  if (!(await session.run(editable))) {
    await clickByRole(session, { role: "button", name }, NAVIGATION_TIMEOUT_MS);
  }
  await session.waitUntil(editable, null, NAVIGATION_TIMEOUT_MS);
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

const CONNECTION_SECTIONS = new Set(["apps", "mcp", "skills"]);

export async function openSettingsSection(session, section) {
  if (CONNECTION_SECTIONS.has(section)) {
    await openSettingsSection(session, "connections");
    await clickByRole(
      session,
      {
        role: "tab",
        name: await translate(session, `settings:sections.${section}`),
      },
      NAVIGATION_TIMEOUT_MS,
    );
    return;
  }
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

async function railRegion(session) {
  return {
    role: "navigation",
    name: await translate(session, "sessions:rail.label"),
  };
}

export async function openSidebarForm(session, labelKey) {
  await clickByRole(
    session,
    {
      role: "button",
      name: await translate(session, labelKey),
      within: await railRegion(session),
    },
    NAVIGATION_TIMEOUT_MS,
  );
}

const SESSION_FORM_KEYS = [
  "personal:sidebar.title",
  "sessions:sidebar.workspacesGroup",
  "chat:sidebar.title",
];

const railReturnForms = new WeakMap();

async function currentRailItem(session) {
  return session.run(
    () =>
      document
        .querySelector('[data-testid="app-rail"] [aria-current="page"]')
        ?.getAttribute("aria-label") ?? null,
  );
}

async function sessionFormNames(session) {
  return Promise.all(SESSION_FORM_KEYS.map((key) => translate(session, key)));
}

async function leaveRailApp(session) {
  const current = await currentRailItem(session);
  if (current === null) return;
  if ((await sessionFormNames(session)).includes(current)) return;
  await clickByRole(
    session,
    {
      role: "button",
      name:
        railReturnForms.get(session) ??
        (await translate(session, "sessions:sidebar.workspacesGroup")),
      within: await railRegion(session),
    },
    NAVIGATION_TIMEOUT_MS,
  );
}

export async function openRailApp(session, view) {
  const within = await railRegion(session);
  const from = await currentRailItem(session);
  if ((await sessionFormNames(session)).includes(from)) {
    railReturnForms.set(session, from);
  }
  const name = await translate(session, PANEL_VIEW_KEYS[view]);
  const inMore = RAIL_MORE_APPS.has(view);
  const moreName = await translate(session, "sessions:rail.more");
  if (inMore) {
    await clickByRole(
      session,
      { role: "button", name: moreName, within },
      NAVIGATION_TIMEOUT_MS,
    );
    await clickByRole(
      session,
      { role: "menuitem", name },
      NAVIGATION_TIMEOUT_MS,
    );
  } else {
    await clickByRole(
      session,
      { role: "button", name, within },
      NAVIGATION_TIMEOUT_MS,
    );
  }
  await session.waitUntil(
    (label) =>
      document
        .querySelector('[data-testid="app-rail"] [aria-current="page"]')
        ?.getAttribute("aria-label") === label,
    inMore ? moreName : name,
    NAVIGATION_TIMEOUT_MS,
  );
}

export async function openAssistantsTab(session) {
  await openSidebarForm(session, "personal:sidebar.title");
}
