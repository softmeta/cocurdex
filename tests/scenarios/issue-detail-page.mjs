import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import {
  centerOf,
  clickByRole,
  clickPoint,
  clickSelector,
  queryAllByRole,
  waitForRole,
} from "./lib/locate.mjs";
import { showPanelView, translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const ISSUE_TITLE = "Checkout fails for some carts";
const RENAMED_TITLE = "Checkout fails for carts with discounts";

const args = readScenarioArgs();

function pageSelector(issueId) {
  return `article[data-issue-id="${issueId}"]`;
}

async function findIssueId(session, title) {
  const candidates = await daemonRequest(session, "link.candidates");
  const found = candidates.find(
    (item) => item.target.kind === "issue" && item.title === title,
  );
  if (!found) throw new Error(`no issue titled ${title}`);
  return found.target.id;
}

async function waitForSelector(session, selector, present = true) {
  await session.waitUntil(
    ({ selector, present }) =>
      Boolean(document.querySelector(selector)) === present,
    { selector, present },
    UI_TIMEOUT_MS,
  );
}

async function waitForIssue(session, issueId, predicate, label) {
  const deadline = Date.now() + UI_TIMEOUT_MS;
  let issue = null;
  while (Date.now() < deadline) {
    issue = await daemonRequest(session, "issue.get", { id: issueId });
    if (issue && predicate(issue)) return issue;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`${label}: ${JSON.stringify(issue)}`);
}

async function pressKey(session, key, code = key) {
  for (const type of ["keyDown", "keyUp"]) {
    await session.send("Input.dispatchKeyEvent", { type, key, code });
  }
}

async function typeAtDescriptionEnd(session, issueId, text) {
  const editor = `${pageSelector(issueId)} .md-body-prose`;
  await session.waitUntil(
    (selector) => Boolean(document.querySelector(selector)?.editor),
    editor,
    UI_TIMEOUT_MS,
  );
  await session.run(
    (selector) => document.querySelector(selector).editor.commands.focus("end"),
    editor,
  );
  await session.waitUntil(
    (selector) =>
      document.querySelector(selector).contains(document.activeElement),
    editor,
    UI_TIMEOUT_MS,
  );
  await session.send("Input.insertText", { text });
}

runScenario("issue-detail-page", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    const issueId = await findIssueId(session, ISSUE_TITLE);
    await showPanelView(session, "issues");
    return { issueId };
  },
  steps: [
    [
      "a card opens the issue as a page in the panel, not a dialog",
      async ({ session, issueId }) => {
        const card = `div[data-issue-id="${issueId}"] [role="button"]`;
        await waitForSelector(session, card);
        await clickSelector(session, card, { fromLeft: 24 });
        await waitForSelector(session, pageSelector(issueId));
        const state = await session.run(
          (board) => ({
            dialog: Boolean(document.querySelector('[role="dialog"]')),
            boardVisible: Boolean(
              document.querySelector(board)?.getClientRects().length,
            ),
          }),
          '[data-testid="issues-view-display-bar"]',
        );
        check(!state.dialog, "issue opened in a dialog", state);
        check(!state.boardVisible, "board chrome stays visible", state);
        return state;
      },
    ],
    [
      "the title saves on Enter",
      async ({ session, issueId }) => {
        const input = `${pageSelector(issueId)} input`;
        await session.run((selector) => {
          const element = document.querySelector(selector);
          element.focus();
          element.select();
        }, input);
        await session.send("Input.insertText", { text: RENAMED_TITLE });
        await pressKey(session, "Enter");
        await waitForIssue(
          session,
          issueId,
          (issue) => issue.title === RENAMED_TITLE,
          "title not saved",
        );
        const stillEditing = await session.run(
          (selector) =>
            document.activeElement === document.querySelector(selector),
          input,
        );
        check(!stillEditing, "Enter keeps the title focused");
        return {};
      },
    ],
    [
      "the description saves while typing",
      async ({ session, issueId }) => {
        await typeAtDescriptionEnd(session, issueId, " Typed on the page.");
        const issue = await waitForIssue(
          session,
          issueId,
          (candidate) =>
            candidate.description?.includes("Typed on the page.") ?? false,
          "description not autosaved",
        );
        return { description: issue.description };
      },
    ],
    [
      "a status change saves at once",
      async ({ session, issueId }) => {
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "issues:dialog.status"),
          within: { role: "article" },
        });
        await waitForRole(session, { role: "menuitem" }, UI_TIMEOUT_MS);
        const [first] = await queryAllByRole(session, { role: "menuitem" });
        await clickPoint(session, await centerOf(session, first.backendNodeId));
        const issue = await waitForIssue(
          session,
          issueId,
          (candidate) => candidate.status !== "doing",
          "status not saved",
        );
        return { status: issue.status };
      },
    ],
    [
      "going back right after typing keeps the unsaved description",
      async ({ session, issueId }) => {
        await typeAtDescriptionEnd(session, issueId, " Left at once.");
        const backPrefix = await translate(
          session,
          "issues:detail.backToView",
          { view: "" },
        );
        await clickByRole(session, {
          role: "button",
          name: new RegExp(`^${RegExp.escape(backPrefix)}`),
        });
        await waitForSelector(session, pageSelector(issueId), false);
        await waitForSelector(
          session,
          `div[data-issue-id="${issueId}"] [role="button"]`,
        );
        await waitForIssue(
          session,
          issueId,
          (issue) => issue.description?.includes("Left at once.") ?? false,
          "description lost on leaving",
        );
        return {};
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
