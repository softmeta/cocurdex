import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./lib/appearance.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import {
  centerOf,
  clickByRole,
  clickPoint,
  clickSelector,
  waitForRole,
} from "./lib/locate.mjs";
import { openNote, showPanelView, translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const NOTE_TITLE = "Checkout architecture";
const BODY = `Totals use $\\sum_i p_i q_i$ before tax.

Rate $r$ applies first, then rate $r$ applies second.

\`\`\`mermaid
graph LR
  Cart --> Checkout --> Payment
\`\`\`

\`\`\`math
t = \\frac{a_1}{b} \\cdot (1 + r)
\`\`\`
`;

const args = readScenarioArgs();

function readRendered() {
  const blocks = [
    ...document.querySelectorAll(".md-body-prose .md-code-block"),
  ];
  const byLanguage = (language) =>
    blocks.find((block) => block.dataset.codeLanguage === language);
  const mermaid = byLanguage("mermaid");
  const math = byLanguage("math");
  const inline = document.querySelector(".md-body-prose .note-math");
  const source = document.querySelector(".md-body-prose .note-math-source");
  if (
    !mermaid?.querySelector(".md-rendered-preview svg") ||
    !math?.querySelector(".katex")
  ) {
    return null;
  }
  if (!inline?.querySelector(".katex")) return null;
  const visible = (element) => getComputedStyle(element).display !== "none";
  return {
    mermaidLabels: ["Cart", "Checkout", "Payment"].every((label) =>
      mermaid
        .querySelector(".md-rendered-preview svg")
        .textContent.includes(label),
    ),
    mermaidSourceVisible: visible(mermaid.querySelector("pre")),
    mathSourceVisible: visible(math.querySelector("pre")),
    inlineSourceVisible: source ? visible(source) : false,
    inlineLabel: inline.getAttribute("aria-label"),
  };
}

async function captureEditor(session, name) {
  const artifacts = process.env.COCURDEX_TEST_ARTIFACTS_DIR;
  if (!artifacts) return null;
  const clip = await session.run(() => {
    const rect = document
      .querySelector(".md-body-prose")
      .getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const { data } = await session.send("Page.captureScreenshot", {
    format: "png",
    clip: { ...clip, scale: 1 },
  });
  await mkdir(artifacts, { recursive: true });
  const file = path.join(artifacts, `${name}.png`);
  await writeFile(file, Buffer.from(data, "base64"));
  return file;
}

runScenario("note-diagrams", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    const note = await daemonRequest(session, "note.create", {
      title: NOTE_TITLE,
      bodyMarkdown: BODY,
    });
    await showPanelView(session, "notes");
    await waitForRole(
      session,
      { role: "button", name: NOTE_TITLE },
      UI_TIMEOUT_MS,
    );
    await openNote(session, NOTE_TITLE);
    return { noteId: note.id };
  },
  steps: [
    [
      "diagrams and formulas render in place of their source in both themes",
      async ({ session }) => {
        const results = {};
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          await session.waitUntil(readRendered, null, UI_TIMEOUT_MS);
          const rendered = await session.run(readRendered);
          check(rendered.mermaidLabels, "diagram labels", rendered);
          check(
            !rendered.mermaidSourceVisible && !rendered.mathSourceVisible,
            "block source shows while not editing",
            rendered,
          );
          check(
            !rendered.inlineSourceVisible &&
              rendered.inlineLabel === "\\sum_i p_i q_i",
            "inline formula",
            rendered,
          );
          results[theme] = {
            ...rendered,
            screenshot: await captureEditor(session, `note-diagrams-${theme}`),
          };
        }
        await clearColorScheme(session);
        return results;
      },
    ],
    [
      "the source toggle shows and hides a diagram's source",
      async ({ session }) => {
        const mermaidSource = () => {
          const block = document.querySelector(
            '.md-body-prose .md-code-block[data-code-language="mermaid"]',
          );
          return {
            source: getComputedStyle(block.querySelector("pre")).display,
            preview: Boolean(block.querySelector(".md-rendered-preview svg")),
          };
        };
        const toggle = '[data-code-language="mermaid"] button[aria-pressed]';
        await clickSelector(session, toggle);
        await session.waitUntil(
          () =>
            getComputedStyle(
              document.querySelector(
                '.md-body-prose .md-code-block[data-code-language="mermaid"] pre',
              ),
            ).display !== "none",
          null,
          UI_TIMEOUT_MS,
        );
        const shown = await session.run(mermaidSource);
        check(shown.preview, "preview stays below the source", shown);
        await clickSelector(session, toggle);
        await session.waitUntil(
          () =>
            getComputedStyle(
              document.querySelector(
                '.md-body-prose .md-code-block[data-code-language="mermaid"] pre',
              ),
            ).display === "none",
          null,
          UI_TIMEOUT_MS,
        );
        return { shown, hidden: await session.run(mermaidSource) };
      },
    ],
    [
      "a diagram opens full screen",
      async ({ session }) => {
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "common:mermaid.openPreview"),
        });
        const [dialog] = await waitForRole(
          session,
          {
            role: "dialog",
            name: await translate(session, "common:mermaid.title"),
          },
          UI_TIMEOUT_MS,
        );
        await session.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        });
        await session.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        });
        await session.waitUntil(
          () => !document.querySelector('[role="dialog"]'),
          null,
          UI_TIMEOUT_MS,
        );
        return { dialog: dialog.name };
      },
    ],
    [
      "clicking a repeated formula opens that occurrence",
      async ({ session }) => {
        const formulas = await waitForRole(
          session,
          { role: "math", name: "r" },
          UI_TIMEOUT_MS,
        );
        check(formulas.length === 2, "repeated formulas", formulas);
        await clickPoint(
          session,
          await centerOf(session, formulas[1].backendNodeId),
        );
        await session.waitUntil(
          () =>
            document.querySelectorAll(
              '.md-body-prose .note-math[aria-label="r"]',
            ).length === 1,
          null,
          UI_TIMEOUT_MS,
        );
        const opened = await session.run(() => ({
          caret: getSelection()?.anchorNode?.textContent ?? "",
        }));
        check(
          opened.caret.includes("second"),
          "caret in second formula",
          opened,
        );
        return opened;
      },
    ],
    [
      "opening the note leaves its markdown unchanged",
      async ({ session, noteId }) => {
        const { bodyMarkdown } = await daemonRequest(session, "note.get", {
          id: noteId,
        });
        check(
          bodyMarkdown.trim() === BODY.trim(),
          "markdown rewritten",
          bodyMarkdown,
        );
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
