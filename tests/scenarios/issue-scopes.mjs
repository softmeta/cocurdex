import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import {
  centerOf,
  clickByRole,
  clickPoint,
  queryAllByRole,
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

async function hoverMenuItem(session, name) {
  const [item] = await waitForRole(
    session,
    { role: "menuitem", name },
    UI_TIMEOUT_MS,
  );
  const center = await centerOf(session, item.backendNodeId);
  for (const point of [{ x: center.x - 40, y: center.y }, center]) {
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      ...point,
    });
  }
}

async function openedIssueId(session) {
  return session.run(
    () => document.querySelector("article[data-issue-id]")?.dataset.issueId,
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
    return {
      sourceViewId: board.view.id,
      statusColumns,
      usedStatuses: new Set(board.issues.map((issue) => issue.status)),
      viewsBefore,
    };
  },
  steps: [
    [
      "the scope tabs hold every quick filter and the sidebar lists only views",
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
        const sidebarRows = await Promise.all(
          [names[0], names[1]].map((name) =>
            queryAllByRole(session, { role: "button", name }),
          ),
        );
        check(
          sidebarRows.every((rows) => rows.length === 0),
          "sidebar still lists a quick filter",
          { sidebarRows },
        );
        return { tabs: tabs.map((tab) => tab.name) };
      },
    ],
    [
      "the Active tab shows only open, non-backlog status columns that hold issues",
      async ({ session, statusColumns, usedStatuses }) => {
        await clickByRole(session, {
          role: "tab",
          name: await translate(session, "issues:sidebar.nav.active"),
        });
        const expected = statusColumns
          .filter(
            (column) =>
              (column.category === null ||
                ACTIVE_CATEGORIES.includes(column.category)) &&
              usedStatuses.has(column.id),
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
        await hoverMenuItem(
          session,
          await translate(session, "issues:filter.workspace"),
        );
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
        const scopeName = await translate(session, "issues:sidebar.nav.scope");
        await session.waitUntil(
          (name) =>
            document.querySelectorAll(
              `[role="tablist"][aria-label="${name}"] [aria-selected="true"]`,
            ).length === 0,
          scopeName,
          UI_TIMEOUT_MS,
        );
        return { title: created.title, filters: created.filters };
      },
    ],
    [
      "the column menu opens the status settings, where a category change moves the status",
      async ({ session, statusColumns }) => {
        const status = statusColumns.find(
          (column) => column.category === "started",
        );
        check(Boolean(status), "fixture has no started status", statusColumns);
        const [menu] = await queryAllByRole(session, {
          role: "button",
          name: await translate(session, "issues:board.columnMenu"),
        });
        check(Boolean(menu), "column menu missing");
        await clickPoint(session, await centerOf(session, menu.backendNodeId));
        await clickByRole(
          session,
          {
            role: "menuitem",
            name: await translate(session, "issues:board.manageStatuses"),
          },
          UI_TIMEOUT_MS,
        );
        await waitForRole(
          session,
          {
            role: "heading",
            name: await translate(session, "settings:sections.issueStatuses"),
          },
          UI_TIMEOUT_MS,
        );
        await clickByRole(
          session,
          {
            role: "button",
            name: await translate(session, "issues:statuses.actions", {
              status: status.title,
            }),
          },
          UI_TIMEOUT_MS,
        );
        const [categoryItem] = await waitForRole(
          session,
          {
            role: "menuitem",
            name: await translate(session, "issues:category.title"),
          },
          UI_TIMEOUT_MS,
        );
        const center = await centerOf(session, categoryItem.backendNodeId);
        for (const point of [{ x: center.x - 40, y: center.y }, center]) {
          await session.send("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            ...point,
          });
        }
        const completed = await translate(session, "issues:category.completed");
        await clickByRole(
          session,
          { role: "menuitemradio", name: completed },
          UI_TIMEOUT_MS,
        );
        await session.waitUntil(
          ({ list, id }) =>
            Boolean(
              document.querySelector(
                `ul[aria-label="${list}"] [data-status-id="${id}"]`,
              ),
            ),
          { list: completed, id: status.id },
          UI_TIMEOUT_MS,
        );
        const saved = await daemonRequest(session, "issue.listColumns", {
          field: "status",
        });
        check(
          saved.find((column) => column.id === status.id)?.category ===
            "completed",
          "category not saved",
          saved,
        );
        await daemonRequest(session, "issue.updateColumn", {
          field: "status",
          id: status.id,
          category: "started",
        });
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "settings:sidebar.backToApp"),
        });
        await waitForRole(
          session,
          {
            role: "tablist",
            name: await translate(session, "issues:sidebar.nav.scope"),
          },
          UI_TIMEOUT_MS,
        );
        return { status: status.id };
      },
    ],
    [
      "grouping by label shows a column per used label and folds empty ones",
      async ({ session, sourceViewId }) => {
        await clickByRole(session, {
          role: "tab",
          name: await translate(session, "issues:sidebar.nav.all"),
        });
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "issues:board.displayOptions"),
        });
        await clickByRole(
          session,
          {
            role: "menuitemradio",
            name: await translate(session, "issues:board.groupByLabel"),
          },
          UI_TIMEOUT_MS,
        );
        await session.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        });
        const deadline = Date.now() + UI_TIMEOUT_MS;
        let board;
        while (Date.now() < deadline) {
          board = await daemonRequest(session, "issue.loadView", {
            viewId: sourceViewId,
          });
          if (board.view.groupBy === "label") break;
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
        check(board.view.groupBy === "label", "group-by not saved", board.view);
        const used = new Set(board.issues.flatMap((issue) => issue.columnIds));
        const noLabel = await translate(
          session,
          "issues:board.ungrouped.label",
        );
        const titleOf = (column) =>
          column.id === "__none__" ? noLabel : column.title;
        const visible = board.columns.filter((column) => used.has(column.id));
        const hidden = board.columns.filter((column) => !used.has(column.id));
        await waitForColumnTitles(session, visible.map(titleOf));
        if (hidden.length > 0) {
          await waitForRole(
            session,
            {
              role: "region",
              name: await translate(session, "issues:board.hiddenColumns"),
            },
            UI_TIMEOUT_MS,
          );
        }
        return {
          visible: visible.map(titleOf),
          hidden: hidden.map(titleOf),
        };
      },
    ],
    [
      "the detail page steps through the view's issues with J and K",
      async ({ session, sourceViewId }) => {
        const firstCard = await session.run(
          () => document.querySelector("[data-issue-id]")?.dataset.issueId,
        );
        check(Boolean(firstCard), "no issue card on the board");
        const box = await session.run((id) => {
          const rect = document
            .querySelector(`[data-issue-id="${id}"]`)
            .getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        }, firstCard);
        await clickPoint(session, box);
        await session.waitUntil(
          (id) =>
            document.querySelector("article[data-issue-id]")?.dataset
              .issueId === id,
          firstCard,
          UI_TIMEOUT_MS,
        );
        await session.run(() => document.activeElement?.blur());
        const press = (key) =>
          session.send("Input.dispatchKeyEvent", {
            type: "keyDown",
            key,
            text: key,
            code: `Key${key.toUpperCase()}`,
          });
        await press("j");
        await session.waitUntil(
          (id) => {
            const current = document.querySelector("article[data-issue-id]")
              ?.dataset.issueId;
            return Boolean(current) && current !== id;
          },
          firstCard,
          UI_TIMEOUT_MS,
        );
        const second = await openedIssueId(session);
        await press("k");
        await session.waitUntil(
          (id) =>
            document.querySelector("article[data-issue-id]")?.dataset
              .issueId === id,
          firstCard,
          UI_TIMEOUT_MS,
        );
        await daemonRequest(session, "issue.updateView", {
          viewId: sourceViewId,
          groupBy: "status",
        });
        return { first: firstCard, second };
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
