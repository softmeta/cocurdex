import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./lib/appearance.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import { clickByRole, clickPoint, waitForRole } from "./lib/locate.mjs";
import { openNote, showPanelView, translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const NOTE_TITLE = "Discount math";
const BLOCK = ".md-body-prose .md-code-block";

const args = readScenarioArgs();

function readHighlight() {
  const block = document.querySelector(".md-body-prose .md-code-block");
  const keyword = [...(block?.querySelectorAll("code span[style]") ?? [])].find(
    (span) => span.textContent.trim() === "export",
  );
  if (!keyword) return null;
  const code = block.querySelector("code");
  const pre = block.querySelector("pre");
  return {
    language: block.dataset.codeLanguage,
    lines: Math.round(
      (pre.clientHeight -
        Number.parseFloat(getComputedStyle(pre).paddingTop) -
        Number.parseFloat(getComputedStyle(pre).paddingBottom)) /
        Number.parseFloat(getComputedStyle(pre).lineHeight),
    ),
    scrolls: pre.scrollWidth > pre.clientWidth,
    keyword: getComputedStyle(keyword).color,
    base: getComputedStyle(code).color,
    tokens: block.querySelectorAll("code span[style]").length,
  };
}

async function captureBlock(session, name) {
  const artifacts = process.env.COCURDEX_TEST_ARTIFACTS_DIR;
  if (!artifacts) return null;
  const clip = await session.run((selector) => {
    const rect = document.querySelector(selector).getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, BLOCK);
  const { data } = await session.send("Page.captureScreenshot", {
    format: "png",
    clip: { ...clip, scale: 1 },
  });
  await mkdir(artifacts, { recursive: true });
  const file = path.join(artifacts, `${name}.png`);
  await writeFile(file, Buffer.from(data, "base64"));
  return file;
}

async function noteMarkdown(session) {
  const notes = await daemonRequest(session, "note.list");
  const note = notes.find((item) => item.title === NOTE_TITLE);
  return (await daemonRequest(session, "note.get", { id: note.id }))
    .bodyMarkdown;
}

async function waitForMarkdown(session, fragment) {
  const deadline = Date.now() + UI_TIMEOUT_MS;
  for (;;) {
    const markdown = await noteMarkdown(session);
    if (markdown.includes(fragment)) return markdown;
    if (Date.now() > deadline) {
      throw new Error(`note markdown lacks ${fragment}: ${markdown}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function pickLanguage(session, label) {
  await clickByRole(session, {
    role: "combobox",
    name: await translate(session, "notes:codeBlock.language"),
  });
  await clickByRole(session, { role: "option", name: label }, UI_TIMEOUT_MS);
}

async function pressKey(session, key, modifiers = 0) {
  const codes = { Tab: 9, End: 35 };
  for (const type of ["keyDown", "keyUp"]) {
    await session.send("Input.dispatchKeyEvent", {
      type,
      key,
      code: key,
      modifiers,
      windowsVirtualKeyCode: codes[key],
    });
  }
}

function secondLineIndent() {
  const code = document.querySelector(".md-body-prose .md-code-block code");
  const line = code.textContent.split("\n")[1] ?? "";
  return line.length - line.trimStart().length;
}

runScenario("note-code-block", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    await showPanelView(session, "notes");
    await waitForRole(
      session,
      { role: "button", name: NOTE_TITLE },
      UI_TIMEOUT_MS,
    );
    await openNote(session, NOTE_TITLE);
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
          check(highlight.language === "typescript", "language", highlight);
          check(highlight.tokens > 10, "token count", highlight);
          check(highlight.lines === 4, "long lines wrap", highlight);
          check(
            highlight.keyword !== highlight.base,
            "keyword uses the base color",
            highlight,
          );
          results[theme] = {
            ...highlight,
            screenshot: await captureBlock(session, `note-code-${theme}`),
          };
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
    [
      "the language picker changes the grammar and saves the fence",
      async ({ session }) => {
        await pickLanguage(session, "Python");
        await session.waitUntil(
          (selector) =>
            document.querySelector(selector)?.dataset.codeLanguage === "python",
          BLOCK,
          UI_TIMEOUT_MS,
        );
        const python = await waitForMarkdown(session, "```python");
        await pickLanguage(session, "TypeScript");
        const restored = await waitForMarkdown(session, "```typescript");
        await session.waitUntil(readHighlight, null, UI_TIMEOUT_MS);
        return { python: python.includes("```python"), restored: true };
      },
    ],
    [
      "Tab indents inside the code block instead of leaving it",
      async ({ session }) => {
        const point = await session.run((selector) => {
          const code = document.querySelector(`${selector} code`);
          const walker = document.createTreeWalker(code, NodeFilter.SHOW_TEXT);
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const index = node.textContent.indexOf("const");
            if (index < 0) continue;
            const range = document.createRange();
            range.setStart(node, index);
            range.setEnd(node, index + 1);
            const rect = range.getBoundingClientRect();
            return { x: rect.left + 1, y: rect.top + rect.height / 2 };
          }
          return null;
        }, BLOCK);
        await session.run(() => {
          window.__codeSelectionChanges = 0;
          document.addEventListener("selectionchange", () => {
            window.__codeSelectionChanges += 1;
          });
        });
        await clickPoint(session, point);
        await session.waitUntil(
          () => window.__codeSelectionChanges > 0,
          null,
          UI_TIMEOUT_MS,
        );
        const before = await session.run(secondLineIndent);
        await pressKey(session, "Tab");
        await session.waitUntil(
          (expected) => {
            const code = document.querySelector(
              ".md-body-prose .md-code-block code",
            );
            const line = code.textContent.split("\n")[1] ?? "";
            return line.length - line.trimStart().length === expected;
          },
          before + 2,
          UI_TIMEOUT_MS,
        );
        const focused = await session.run(() =>
          Boolean(document.activeElement?.closest(".md-body-prose")),
        );
        check(focused, "focus left the editor", { focused });
        await pressKey(session, "Tab", 8);
        await session.waitUntil(
          (expected) => {
            const code = document.querySelector(
              ".md-body-prose .md-code-block code",
            );
            const line = code.textContent.split("\n")[1] ?? "";
            return line.length - line.trimStart().length === expected;
          },
          before,
          UI_TIMEOUT_MS,
        );
        return { before, focused };
      },
    ],
    [
      "the copy button copies the code",
      async ({ session }) => {
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "notes:codeBlock.copy"),
        });
        await waitForRole(
          session,
          {
            role: "button",
            name: await translate(session, "notes:codeBlock.copied"),
          },
          UI_TIMEOUT_MS,
        );
        const copied = await session.run(() => navigator.clipboard.readText());
        check(
          copied.startsWith("export function applyDiscount"),
          "clipboard text",
          { copied },
        );
        return { length: copied.length };
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
