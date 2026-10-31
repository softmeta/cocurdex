import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./lib/appearance.mjs";
import { showPanelView } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const FILE_NAME = "pricing.ts";
const ORIGINAL = [
  "export function total(cents: number): number {",
  "  return cents;",
  "}",
  "",
].join("\n");
const CHANGED = [
  "export function total(cents: number, rate = 0.2): number {",
  '  const label = "discounted";',
  "  return Math.round(cents * (1 - rate));",
  "}",
  "",
].join("\n");

const args = readScenarioArgs();
const run = promisify(execFile);

async function git(cwd, ...gitArgs) {
  await run(
    "git",
    [
      "-c",
      "user.name=Scenario",
      "-c",
      "user.email=scenario@example.invalid",
      "-c",
      "commit.gpgsign=false",
      ...gitArgs,
    ],
    { cwd },
  );
}

function readHighlight() {
  const spans = [...document.querySelectorAll("diffs-container")].flatMap(
    (host) => [...(host.shadowRoot?.querySelectorAll("code span") ?? [])],
  );
  const keyword = spans.find(
    (span) =>
      span.childElementCount === 0 && span.textContent.trim() === "const",
  );
  const string = spans.find(
    (span) =>
      span.childElementCount === 0 &&
      span.textContent.trim() === '"discounted"',
  );
  if (!keyword || !string) return null;
  return {
    keyword: getComputedStyle(keyword).color,
    string: getComputedStyle(string).color,
    tokens: spans.length,
  };
}

runScenario("git-diff-highlight", {
  open: async () => {
    const app = await openScenarioApp(args);
    const file = path.join(app.workspaceRoot, FILE_NAME);
    await git(app.workspaceRoot, "init", "--quiet");
    await writeFile(file, ORIGINAL, "utf8");
    await git(app.workspaceRoot, "add", FILE_NAME);
    await git(app.workspaceRoot, "commit", "--quiet", "-m", "initial");
    await writeFile(file, CHANGED, "utf8");
    return app;
  },
  setup: async ({ session }) => {
    await showPanelView(session, "git");
    return {};
  },
  steps: [
    [
      "a TypeScript diff is highlighted in both themes",
      async ({ session }) => {
        const results = {};
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          await session.waitUntil(readHighlight, null, UI_TIMEOUT_MS);
          const highlight = await session.run(readHighlight);
          check(
            highlight.keyword !== highlight.string,
            "keyword and string share a color",
            highlight,
          );
          results[theme] = highlight;
        }
        check(
          results.light.keyword !== results.dark.keyword,
          "keyword color does not follow the theme",
          results,
        );
        await clearColorScheme(session);
        return results;
      },
    ],
  ],
  teardown: async () => ({}),
});
