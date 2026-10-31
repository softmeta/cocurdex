import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import { clickByRole, queryAllByRole, waitForRole } from "./lib/locate.mjs";
import { translate } from "./lib/navigate.mjs";

const ACTIVE_TITLES = [
  "Add percentage discount codes",
  "Investigate failing checkout",
  "Draft release notes",
];
const ARCHIVED_TITLE = "Spike: gift cards";
const INTERRUPTED_TITLE = "Store cart totals in cents";
const QUEUED_PROMPT = "Then update the release notes.";
const UI_TIMEOUT_MS = 30_000;

const args = readScenarioArgs();
if (args.port) {
  console.error("fixture-db runs only on an isolated instance; omit --port");
  process.exit(2);
}

runScenario("fixture-db", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session, fixtureDb }) => {
    check(fixtureDb, "fixture database was not installed");
    await session.waitUntil(
      (title) => document.body.innerText.includes(title),
      ACTIVE_TITLES[0],
      UI_TIMEOUT_MS,
    );
    return {};
  },
  steps: [
    [
      "sidebar lists seeded sessions",
      async ({ session }) => {
        const text = await session.run(() => document.body.innerText);
        const missing = ACTIVE_TITLES.filter((title) => !text.includes(title));
        check(missing.length === 0, "missing session titles", missing);
        check(!text.includes(ARCHIVED_TITLE), "archived session is listed");
        return { titles: ACTIVE_TITLES.length };
      },
    ],
    [
      "opens a session with tool calls",
      async ({ session }) => {
        await clickByRole(session, {
          role: "button",
          name: ACTIVE_TITLES[0],
          exact: false,
        });
        await session.waitUntil(
          () => document.body.innerText.includes("never returns a negative"),
          null,
          UI_TIMEOUT_MS,
        );
        const text = await session.run(() => document.body.innerText);
        check(
          text.includes("Does the README mention discounts?"),
          "second user turn missing",
        );
        return {};
      },
    ],
    [
      "syncs a session archived and restored by another client",
      async ({ session }) => {
        const title = ACTIVE_TITLES[2];
        const { sessions } = await daemonRequest(session, "app.bootstrap");
        const sessionId =
          sessions.find((entry) => entry.title === title)?.id ?? null;
        if (sessionId) {
          await daemonRequest(session, "session.archiveMany", {
            sessionIds: [sessionId],
          });
        }
        check(sessionId, "session not found", title);
        await session.waitUntil(
          (title) => !document.body.innerText.includes(title),
          title,
          UI_TIMEOUT_MS,
        );
        const text = await session.run(() => document.body.innerText);
        check(text.includes(ACTIVE_TITLES[0]), "other sessions disappeared");
        await daemonRequest(session, "session.restoreMany", {
          sessionIds: [sessionId],
        });
        await session.waitUntil(
          (title) => document.body.innerText.includes(title),
          title,
          UI_TIMEOUT_MS,
        );
        return { archived: sessionId };
      },
    ],
    [
      "offers to resume a queue paused by a restart",
      async ({ session }) => {
        await clickByRole(session, {
          role: "button",
          name: INTERRUPTED_TITLE,
          exact: false,
        });
        await session.waitUntil(
          (prompt) => document.body.innerText.includes(prompt),
          QUEUED_PROMPT,
          UI_TIMEOUT_MS,
        );
        const text = await session.run(() => document.body.innerText);
        check(
          text.includes("Cocurdex restarted before this turn finished"),
          "restart notice missing",
        );
        const resume = await translate(session, "agent:queue.resume");
        await waitForRole(
          session,
          { role: "button", name: resume },
          UI_TIMEOUT_MS,
        );
        return {};
      },
    ],
    [
      "resumes the paused queue",
      async ({ session }) => {
        const resume = await translate(session, "agent:queue.resume");
        await clickByRole(session, { role: "button", name: resume });
        const deadline = Date.now() + UI_TIMEOUT_MS;
        while (
          (await queryAllByRole(session, { role: "button", name: resume }))
            .length > 0
        ) {
          check(Date.now() < deadline, "resume control stayed visible");
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
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
  teardown: async () => ({}),
});
