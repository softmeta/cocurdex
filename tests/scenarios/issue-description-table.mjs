import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clickByRole, clickPoint, waitForRole } from "./lib/locate.mjs";
import {
  BODY_EDITOR_IN_DIALOG,
  openNewIssueDialog,
  translate,
} from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const TABLE_HTML =
  "<table><tr><th><p>a</p></th><th><p>b</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>";

const args = readScenarioArgs();

function blocks(session) {
  return session.run(
    (selector) =>
      document
        .querySelector(selector)
        .editor.getJSON()
        .content.map((node) =>
          node.type === "table"
            ? `table:${node.content.length}`
            : `${node.type}:${node.content?.[0]?.text ?? ""}`,
        ),
    BODY_EDITOR_IN_DIALOG,
  );
}

async function hoverBodyCell(session) {
  const point = await session.run((selector) => {
    const rect = document
      .querySelector(selector)
      .querySelector("table")
      .rows[1].cells[1].getBoundingClientRect();
    return { x: rect.left + 10, y: rect.top + rect.height / 2 };
  }, BODY_EDITOR_IN_DIALOG);
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...point,
  });
}

runScenario("issue-description-table", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    await openNewIssueDialog(session);
    await session.run(
      ({ selector, html }) =>
        document.querySelector(selector).editor.commands.setContent(html),
      { selector: BODY_EDITOR_IN_DIALOG, html: TABLE_HTML },
    );
    return {};
  },
  steps: [
    [
      "table controls appear inside the dialog",
      async ({ session }) => {
        await hoverBodyCell(session);
        const [rowOptions, addRow, addColumn] = await Promise.all([
          translate(session, "notes:table.rowOptions", { index: 2 }),
          translate(session, "notes:table.addRow"),
          translate(session, "notes:table.addColumn"),
        ]);
        const dialog = { role: "dialog" };
        for (const name of [rowOptions, addRow, addColumn]) {
          await waitForRole(
            session,
            { role: "button", name, within: dialog },
            UI_TIMEOUT_MS,
          );
        }
        const overflow = await session.run(() => {
          const frame = document
            .querySelector('[role="dialog"]')
            .getBoundingClientRect();
          return [...document.querySelectorAll("[data-table-axis]")]
            .map((element) => element.getBoundingClientRect())
            .filter(
              (rect) =>
                rect.left < frame.left ||
                rect.right > frame.right ||
                rect.top < frame.top,
            ).length;
        });
        check(overflow === 0, "table handles overflow the dialog", overflow);
        await clickByRole(session, {
          role: "button",
          name: addRow,
          within: dialog,
        });
        await session.waitUntil(
          (selector) =>
            document.querySelector(selector).querySelector("table").rows
              .length === 3,
          BODY_EDITOR_IN_DIALOG,
          UI_TIMEOUT_MS,
        );
        return { blocks: await blocks(session) };
      },
    ],
    [
      "clicking below a trailing table starts a paragraph",
      async ({ session }) => {
        const point = await session.run((selector) => {
          const editor = document.querySelector(selector);
          const table = editor
            .querySelector(".tableWrapper")
            .getBoundingClientRect();
          const bottom = editor.getBoundingClientRect().bottom;
          return { x: table.left + 40, y: (table.bottom + bottom) / 2 + 8 };
        }, BODY_EDITOR_IN_DIALOG);
        await clickPoint(session, point);
        await session.send("Input.insertText", { text: "Below" });
        const result = await blocks(session);
        check(
          result.join("|") === "table:3|paragraph:Below",
          "text did not land in a paragraph below the table",
          result,
        );
        return { point, blocks: result };
      },
    ],
  ],
  teardown: async ({ session }) => {
    await clickByRole(session, {
      role: "button",
      name: await translate(session, "issues:dialog.cancel"),
      within: { role: "dialog" },
    });
    await session.waitUntil(
      () => !document.querySelector('[role="dialog"]'),
      null,
      UI_TIMEOUT_MS,
    );
    return {};
  },
});
