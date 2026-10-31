import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./lib/appearance.mjs";
import { clickByRole } from "./lib/locate.mjs";

const SESSION_ROW = /^Checkout audit log\s+(?![(（])/;
const UI_TIMEOUT_MS = 30_000;

const args = readScenarioArgs();

function readHighlight() {
  const body = document.querySelector(
    '[data-streamdown="code-block-body"][data-language="ts"]',
  );
  const spans = [...(body?.querySelectorAll("code span span") ?? [])];
  const keyword = spans.find((span) => span.textContent.trim() === "const");
  const number = spans.find((span) => /^\d+$/.test(span.textContent.trim()));
  if (!keyword || !number) return null;
  return {
    keyword: getComputedStyle(keyword).color,
    number: getComputedStyle(number).color,
    base: getComputedStyle(body.querySelector("code")).color,
    tokens: spans.length,
  };
}

runScenario("chat-code-block", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    await clickByRole(
      session,
      { role: "button", name: SESSION_ROW },
      UI_TIMEOUT_MS,
    );
    return {};
  },
  steps: [
    [
      "a fenced TypeScript block is highlighted in both themes",
      async ({ session }) => {
        const results = {};
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          await session.waitUntil(readHighlight, null, UI_TIMEOUT_MS);
          const highlight = await session.run(readHighlight);
          check(highlight.tokens > 10, "token count", highlight);
          check(
            highlight.keyword !== highlight.base,
            "keyword uses the base color",
            highlight,
          );
          check(
            highlight.keyword !== highlight.number,
            "keyword and number share a color",
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
