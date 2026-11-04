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
import { showPanelView, translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const ACTIVE_CATEGORIES = ["unstarted", "started"];

const args = readScenarioArgs();

async function visibleColumnTitles(session) {
  return session.run(() =>
    [
      ...document.querySelectorAll('[data-testid="issue-column-title-cell"]'),
    ].map((cell) => cell.textContent.trim()),
  );
}

async function waitForColumnTitles(session, expected) {
  const want = [...expected].sort().join("|");
  await session.waitUntil(
    (want) =>
      [...document.querySelectorAll('[data-testid="issue-column-title-cell"]')]
        .map((cell) => cell.textContent.trim())
        .sort()
        .join("|") === want,
    want,
    UI_TIMEOUT_MS,
  );
}

function filterKey(filter) {
  return `${filter.field}:${filter.op}:${filter.value}`;
}

runScenario("issue-scopes", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    const board = await daemonRequest(session, "issue.loadView", {});
    const statusColumns = board.columns.filter(
      (column) => column.field === "status",
    );
    const viewsBefore = await daemonRequest(session, "issue.listViews");
    await showPanelView(session, "issues");
    await waitForRole(
      session,
      {
        role: "tablist",
        name: await translate(session, "issues:sidebar.nav.scope"),
      },
      UI_TIMEOUT_MS,
    );
    return { sourceViewId: board.view.id, statusColumns, viewsBefore };
  },
  steps: [
    [
      "the sidebar keeps one Issues entry and the scopes move to header tabs",
      async ({ session }) => {
        const tabs = await queryAllByRole(session, { role: "tab" });
        const names = await Promise.all(
          ["all", "active", "backlog"].map((key) =>
            translate(session, `issues:sidebar.nav.${key}`),
          ),
        );
        check(
          names.every((name) => tabs.some((tab) => tab.name === name)),
          "scope tabs missing",
          { tabs, names },
        );
        const sidebarActive = await queryAllByRole(session, {
          role: "button",
          name: names[1],
        });
        check(sidebarActive.length === 0, "sidebar still lists Active", {
          sidebarActive,
        });
        await waitForRole(session, {
          role: "button",
          name: await translate(session, "issues:sidebar.nav.issues"),
        });
        return { tabs: tabs.map((tab) => tab.name) };
      },
    ],
    [
      "the Active tab shows only open, non-backlog status columns",
      async ({ session, statusColumns }) => {
        await clickByRole(session, {
          role: "tab",
          name: await translate(session, "issues:sidebar.nav.active"),
        });
        const expected = statusColumns
          .filter(
            (column) =>
              column.category === null ||
              ACTIVE_CATEGORIES.includes(column.category),
          )
          .map((column) => column.title);
        await waitForColumnTitles(session, expected);
        return { columns: await visibleColumnTitles(session) };
      },
    ],
    [
      "a workspace filter shows up as a removable chip",
      async ({ session }) => {
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "issues:filter.ariaLabel"),
        });
        await waitForRole(session, { role: "menuitemradio" }, UI_TIMEOUT_MS);
        const skip = await Promise.all(
          ["issues:filter.allWorkspaces", "issues:filter.noWorkspace"].map(
            (key) => translate(session, key),
          ),
        );
        const options = await queryAllByRole(session, {
          role: "menuitemradio",
        });
        const workspace = options.find((option) => !skip.includes(option.name));
        check(Boolean(workspace), "no workspace option", options);
        await clickPoint(
          session,
          await centerOf(session, workspace.backendNodeId),
        );
        const removeName = await translate(session, "issues:filter.remove", {
          filter: `${await translate(session, "issues:filter.workspace")} ${workspace.name}`,
        });
        await waitForRole(
          session,
          {
            role: "button",
            name: removeName,
            within: {
              role: "region",
              name: await translate(session, "issues:filter.activeFilters"),
            },
          },
          UI_TIMEOUT_MS,
        );
        return { workspace: workspace.name };
      },
    ],
    [
      "Save as view stores the scope and filters in a new view",
      async ({ session, sourceViewId, viewsBefore }) => {
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "issues:filter.saveAsView"),
        });
        const beforeIds = new Set(viewsBefore.map((view) => view.id));
        const deadline = Date.now() + UI_TIMEOUT_MS;
        let views = [];
        let created;
        while (Date.now() < deadline) {
          views = await daemonRequest(session, "issue.listViews");
          created = views.find(
            (view) => !beforeIds.has(view.id) && view.filters.length > 0,
          );
          if (created) break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        check(Boolean(created), "no view saved", views);
        const keys = new Set(created.filters.map(filterKey));
        const expected = [
          "statusCategory:neq:backlog",
          "statusCategory:neq:completed",
          "statusCategory:neq:canceled",
        ];
        check(
          expected.every((key) => keys.has(key)) &&
            created.filters.some((filter) => filter.field === "workspaceId"),
          "saved view misses scope or workspace filter",
          created.filters,
        );
        const source = views.find((view) => view.id === sourceViewId);
        check(
          source?.filters.length === 0,
          "source view keeps filters",
          source,
        );
        await waitForRole(
          session,
          { role: "button", name: created.title },
          UI_TIMEOUT_MS,
        );
        await waitForNoRole(
          session,
          {
            role: "tablist",
            name: await translate(session, "issues:sidebar.nav.scope"),
          },
          UI_TIMEOUT_MS,
        );
        return { title: created.title, filters: created.filters };
      },
    ],
    [
      "renderer has no errors",
      async ({ session }) => {
        const errors = await session.run(() =>
          window.__scenario.errors.filter((error) => error.level !== "network"),
        );
        check(errors.length === 0, "renderer errors", errors);
        return {};
      },
    ],
  ],
  teardown: async () => ({}),
});
