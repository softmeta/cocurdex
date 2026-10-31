import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./lib/appearance.mjs";
import {
  clickByRole,
  clickPoint,
  queryAllByRole,
  waitForRole,
} from "./lib/locate.mjs";
import { openNote, showPanelView, translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;

const args = readScenarioArgs();

async function pressKey(session, key, code = key) {
  for (const type of ["keyDown", "keyUp"]) {
    await session.send("Input.dispatchKeyEvent", {
      type,
      key,
      code,
      windowsVirtualKeyCode: key === "Enter" ? 13 : 35,
    });
  }
}

async function focusEditorEnd(session) {
  const point = await session.run(() => {
    const blocks = document.querySelector(".md-body-prose").children;
    const rect = blocks[blocks.length - 1].getBoundingClientRect();
    return { x: rect.left + 4, y: rect.top + rect.height / 2 };
  });
  await clickPoint(session, point);
  await pressKey(session, "End");
}

async function captureElement(session, selector, name) {
  const artifacts = process.env.COCURDEX_TEST_ARTIFACTS_DIR;
  if (!artifacts) return null;
  const clip = await session.run((query) => {
    const rect = document.querySelector(query).getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  }, selector);
  const { data } = await session.send("Page.captureScreenshot", {
    format: "png",
    clip: { ...clip, scale: 1 },
  });
  await mkdir(artifacts, { recursive: true });
  const file = path.join(artifacts, `${name}.png`);
  await writeFile(file, Buffer.from(data, "base64"));
  return file;
}

function readTableLayout() {
  const table = document.querySelector(".md-body-prose table");
  if (!table) return null;
  const header = table.querySelector("th");
  const cell = table.querySelector("td");
  const cellParagraph = cell.querySelector("p");
  const headerStyle = getComputedStyle(header);
  const cellStyle = getComputedStyle(cell);
  return {
    headerAlign: headerStyle.textAlign,
    headerBackground: headerStyle.backgroundColor,
    cellBorderWidth: cellStyle.borderTopWidth,
    cellBorderStyle: cellStyle.borderTopStyle,
    cellParagraphMargin: getComputedStyle(cellParagraph).marginTop,
    rowHeight: cell.parentElement.getBoundingClientRect().height,
    lineHeight: Number.parseFloat(cellStyle.lineHeight),
  };
}

async function captureTable(session, theme) {
  const artifacts = process.env.COCURDEX_TEST_ARTIFACTS_DIR;
  if (!artifacts) return null;
  const clip = await session.run(() => {
    const rect = document
      .querySelector(".md-body-prose .tableWrapper")
      .getBoundingClientRect();
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
  });
  const { data } = await session.send("Page.captureScreenshot", {
    format: "png",
    clip: { ...clip, scale: 1 },
  });
  await mkdir(artifacts, { recursive: true });
  const file = path.join(artifacts, `note-table-${theme}.png`);
  await writeFile(file, Buffer.from(data, "base64"));
  return file;
}

const MOD_KEY = process.platform === "darwin" ? 4 : 2;

async function cellCenter(session, row, column) {
  return session.run(
    ({ row, column }) => {
      const tables = document.querySelectorAll(".md-body-prose table");
      const cell = tables[tables.length - 1].rows[row].cells[column];
      const rect = cell.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    },
    { row, column },
  );
}

async function hoverCell(session, row, column) {
  const point = await cellCenter(session, row, column);
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...point,
  });
}

function handleName(session, axis, index) {
  const key =
    axis === "row" ? "notes:table.rowOptions" : "notes:table.columnOptions";
  return translate(session, key, { index: index + 1 });
}

async function openHandleMenu(session, axis, row, column) {
  await hoverCell(session, row, column);
  const name = await handleName(session, axis, axis === "row" ? row : column);
  await clickByRole(session, { role: "button", name }, UI_TIMEOUT_MS);
  await waitForRole(session, { role: "menu" }, UI_TIMEOUT_MS);
}

async function chooseMenuItem(session, key, options) {
  const name = await translate(session, key, options);
  await clickByRole(session, { role: "menuitem", name }, UI_TIMEOUT_MS);
}

async function elementCenter(session, backendNodeId) {
  const { model } = await session.send("DOM.getBoxModel", { backendNodeId });
  const [left, top, , , right, bottom] = model.border;
  return { x: (left + right) / 2, y: (top + bottom) / 2 };
}

async function openAlignSubmenu(session) {
  const name = await translate(session, "notes:table.align.label");
  const [trigger] = await waitForRole(
    session,
    { role: "menuitem", name },
    UI_TIMEOUT_MS,
  );
  const point = await elementCenter(session, trigger.backendNodeId);
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...point,
  });
}

async function dragFrom(session, from, to) {
  await session.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    button: "left",
    buttons: 1,
    clickCount: 1,
    ...from,
  });
  const steps = 8;
  for (let step = 1; step <= steps; step += 1) {
    await session.send("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      button: "left",
      buttons: 1,
      x: from.x + ((to.x - from.x) * step) / steps,
      y: from.y + ((to.y - from.y) * step) / steps,
    });
  }
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    button: "left",
    buttons: 0,
    clickCount: 1,
    ...to,
  });
}

async function waitForGrid(session, expected) {
  await session.waitUntil(
    (expected) => {
      const tables = document.querySelectorAll(".md-body-prose table");
      const table = tables[tables.length - 1];
      if (!table) return false;
      const grid = [...table.rows].map((row) =>
        [...row.cells].map((cell) => cell.textContent.trim()),
      );
      return JSON.stringify(grid) === JSON.stringify(expected);
    },
    expected,
    UI_TIMEOUT_MS,
  );
}

async function waitForShape(session, rows, columns) {
  await session.waitUntil(
    ({ rows, columns }) => {
      const tables = document.querySelectorAll(".md-body-prose table");
      const table = tables[tables.length - 1];
      return (
        table?.rows.length === rows && table.rows[0].cells.length === columns
      );
    },
    { rows, columns },
    UI_TIMEOUT_MS,
  );
}

const CHECKOUT_GRID = [
  ["Code", "Discount", "Status"],
  ["SPRING10", "10% off", "Live"],
  ["FIVEOFF", "5 off", "Draft"],
];

runScenario("note-table", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    await showPanelView(session, "notes");
    await waitForRole(
      session,
      { role: "button", name: "Checkout spec" },
      UI_TIMEOUT_MS,
    );
    return {};
  },
  steps: [
    [
      "body does not repeat the note title as a heading",
      async ({ session }) => {
        await openNote(session, "Acme Shop roadmap");
        await session.waitUntil(
          () => Boolean(document.querySelector(".md-body-prose h2")),
          null,
          UI_TIMEOUT_MS,
        );
        const headings = await session.run(() =>
          [
            ...document.querySelectorAll(
              ".md-body-prose h1, .md-body-prose h2",
            ),
          ].map((node) => node.textContent),
        );
        check(
          !headings.includes("Acme Shop roadmap"),
          "title repeated in body",
          headings,
        );
        return { headings };
      },
    ],
    [
      "table renders with borders, start-aligned headers, and compact rows",
      async ({ session }) => {
        await openNote(session, "Checkout spec");
        await session.waitUntil(
          () => Boolean(document.querySelector(".md-body-prose table td p")),
          null,
          UI_TIMEOUT_MS,
        );
        const results = {};
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          const layout = await session.run(readTableLayout);
          check(layout.headerAlign === "start", "header centered", layout);
          check(
            layout.cellBorderStyle === "solid",
            "cell has no border",
            layout,
          );
          check(layout.cellParagraphMargin === "0px", "cell margin", layout);
          check(
            layout.rowHeight < layout.lineHeight * 2,
            "row too tall",
            layout,
          );
          results[theme] = {
            ...layout,
            screenshot: await captureTable(session, theme),
          };
        }
        await clearColorScheme(session);
        return results;
      },
    ],
    [
      "pasted Markdown text renders as rich content",
      async ({ session }) => {
        await openNote(session, "Scratchpad");
        await session.waitUntil(
          () =>
            document
              .querySelector(".md-body-prose")
              ?.textContent.includes("Ideas that are not tied"),
          null,
          UI_TIMEOUT_MS,
        );
        await focusEditorEnd(session);
        await pressKey(session, "Enter");
        const pasted = await session.run(() => {
          const data = new DataTransfer();
          data.setData(
            "text/plain",
            "## Pasted heading\n\n- first **bold** item\n- second item\n",
          );
          document.activeElement.dispatchEvent(
            new ClipboardEvent("paste", {
              clipboardData: data,
              bubbles: true,
              cancelable: true,
            }),
          );
          const prose = document.querySelector(".md-body-prose");
          return {
            heading: [...prose.querySelectorAll("h2")].some(
              (node) => node.textContent === "Pasted heading",
            ),
            bold: [...prose.querySelectorAll("li strong")].some(
              (node) => node.textContent === "bold",
            ),
            rawMarkers: prose.textContent.includes("## Pasted"),
          };
        });
        check(
          pasted.heading && pasted.bold && !pasted.rawMarkers,
          "pasted Markdown stayed raw",
          pasted,
        );
        return pasted;
      },
    ],
    [
      "slash menu filters to table and inserts one",
      async ({ session }) => {
        await openNote(session, "Acme Shop roadmap");
        const [menuLabel, tableLabel, taskLabel] = await Promise.all(
          [
            "notes:slash.label",
            "notes:slash.items.table",
            "notes:slash.items.taskList",
          ].map((key) => translate(session, key)),
        );
        const tablesBefore = await session.run(
          () => document.querySelectorAll(".md-body-prose table").length,
        );
        await focusEditorEnd(session);
        await pressKey(session, "Enter");
        await session.send("Input.insertText", { text: "/ta" });
        await waitForRole(
          session,
          { role: "listbox", name: menuLabel },
          UI_TIMEOUT_MS,
        );
        const options = (await queryAllByRole(session, { role: "option" })).map(
          (option) => option.name,
        );
        check(
          options.length === 2 &&
            options.some((name) => name.includes(tableLabel)) &&
            options.some((name) => name.includes(taskLabel)),
          "unexpected slash options",
          options,
        );
        const results = {};
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          results[theme] = await captureElement(
            session,
            "[role=listbox]",
            `slash-menu-${theme}`,
          );
        }
        await clearColorScheme(session);
        await clickByRole(session, {
          role: "option",
          name: new RegExp(tableLabel),
        });
        await session.waitUntil(
          (count) =>
            document.querySelectorAll(".md-body-prose table").length > count,
          tablesBefore,
          UI_TIMEOUT_MS,
        );
        return { options, screenshots: results };
      },
    ],
    [
      "slice handles follow the pointer and hide while typing",
      async ({ session }) => {
        await openNote(session, "Checkout spec");
        await waitForGrid(session, CHECKOUT_GRID);
        const handleCount = () =>
          session.run(
            () => document.querySelectorAll("[data-table-axis]").length,
          );
        const waitForHandles = (count) =>
          session.waitUntil(
            (expected) =>
              document.querySelectorAll("[data-table-axis]").length ===
              expected,
            count,
            UI_TIMEOUT_MS,
          );
        const cell = await cellCenter(session, 1, 1);
        await session.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          ...cell,
        });
        await waitForHandles(2);
        for (const type of ["mousePressed", "mouseReleased"]) {
          await session.send("Input.dispatchMouseEvent", {
            type,
            ...cell,
            button: "left",
            clickCount: 1,
          });
        }
        await session.send("Input.dispatchMouseEvent", {
          type: "mouseMoved",
          x: cell.x,
          y: 5,
        });
        await waitForHandles(0);
        await hoverCell(session, 1, 1);
        await waitForHandles(2);
        await session.send("Input.insertText", { text: "x" });
        for (const type of ["keyDown", "keyUp"]) {
          await session.send("Input.dispatchKeyEvent", {
            type,
            key: "Backspace",
            code: "Backspace",
            windowsVirtualKeyCode: 8,
          });
        }
        await waitForHandles(0);
        await waitForGrid(session, CHECKOUT_GRID);
        return { afterTyping: await handleCount() };
      },
    ],
    [
      "hovering a cell shows handles centered on its row and column",
      async ({ session }) => {
        await openNote(session, "Checkout spec");
        await waitForGrid(session, CHECKOUT_GRID);
        await hoverCell(session, 1, 1);
        const [rowHandle] = await waitForRole(
          session,
          { role: "button", name: await handleName(session, "row", 1) },
          UI_TIMEOUT_MS,
        );
        const [columnHandle] = await waitForRole(
          session,
          { role: "button", name: await handleName(session, "column", 1) },
          UI_TIMEOUT_MS,
        );
        const rowCenter = await elementCenter(session, rowHandle.backendNodeId);
        const columnCenter = await elementCenter(
          session,
          columnHandle.backendNodeId,
        );
        const cell = await cellCenter(session, 1, 1);
        const frame = await session.run(() => {
          const rect = document
            .querySelector(".md-body-prose table")
            .getBoundingClientRect();
          return { left: rect.left, top: rect.top };
        });
        const offsets = {
          rowY: rowCenter.y - cell.y,
          rowX: rowCenter.x - frame.left,
          columnX: columnCenter.x - cell.x,
          columnY: columnCenter.y - frame.top,
        };
        for (const [axis, offset] of Object.entries(offsets)) {
          check(Math.abs(offset) <= 0.5, `${axis} handle off center`, offsets);
        }
        const results = {};
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          results[theme] = await captureElement(
            session,
            ".md-body-prose .tableWrapper",
            `note-table-handles-${theme}`,
          );
        }
        await clearColorScheme(session);
        return { offsets, screenshots: results };
      },
    ],
    [
      "row menu inserts a row below and deletes it again",
      async ({ session }) => {
        await openHandleMenu(session, "row", 1, 0);
        await chooseMenuItem(session, "notes:table.insertBelow");
        await waitForGrid(session, [
          CHECKOUT_GRID[0],
          CHECKOUT_GRID[1],
          ["", "", ""],
          CHECKOUT_GRID[2],
        ]);
        await openHandleMenu(session, "row", 2, 0);
        await chooseMenuItem(session, "notes:table.deleteRows", { count: 1 });
        await waitForGrid(session, CHECKOUT_GRID);
        return {};
      },
    ],
    [
      "column menu sorts body rows and keeps the header",
      async ({ session }) => {
        await openHandleMenu(session, "column", 1, 0);
        await chooseMenuItem(session, "notes:table.sortAscending");
        await waitForGrid(session, [
          CHECKOUT_GRID[0],
          CHECKOUT_GRID[2],
          CHECKOUT_GRID[1],
        ]);
        await openHandleMenu(session, "column", 1, 0);
        await chooseMenuItem(session, "notes:table.sortDescending");
        await waitForGrid(session, CHECKOUT_GRID);
        return {};
      },
    ],
    [
      "column menu aligns every cell in the column",
      async ({ session }) => {
        const readAlign = () =>
          session.run(() =>
            [...document.querySelector(".md-body-prose table").rows].map(
              (row) => getComputedStyle(row.cells[1]).textAlign,
            ),
          );
        await openHandleMenu(session, "column", 1, 1);
        await openAlignSubmenu(session);
        const center = await translate(session, "notes:table.align.center");
        await clickByRole(
          session,
          { role: "menuitemradio", name: center },
          UI_TIMEOUT_MS,
        );
        await session.waitUntil(
          () =>
            [...document.querySelector(".md-body-prose table").rows].every(
              (row) => getComputedStyle(row.cells[1]).textAlign === "center",
            ),
          null,
          UI_TIMEOUT_MS,
        );
        const aligned = await readAlign();
        await openHandleMenu(session, "column", 1, 1);
        await openAlignSubmenu(session);
        const left = await translate(session, "notes:table.align.left");
        await clickByRole(
          session,
          { role: "menuitemradio", name: left },
          UI_TIMEOUT_MS,
        );
        await session.waitUntil(
          () =>
            getComputedStyle(
              document.querySelector(".md-body-prose table").rows[1].cells[1],
            ).textAlign !== "center",
          null,
          UI_TIMEOUT_MS,
        );
        return { aligned };
      },
    ],
    [
      "dragging a row handle reorders rows",
      async ({ session }) => {
        await hoverCell(session, 1, 0);
        const [handle] = await waitForRole(
          session,
          { role: "button", name: await handleName(session, "row", 1) },
          UI_TIMEOUT_MS,
        );
        const from = await elementCenter(session, handle.backendNodeId);
        const below = await cellCenter(session, 2, 0);
        await dragFrom(session, from, { x: from.x, y: below.y + 12 });
        await waitForGrid(session, [
          CHECKOUT_GRID[0],
          CHECKOUT_GRID[2],
          CHECKOUT_GRID[1],
        ]);
        await hoverCell(session, 2, 0);
        const [moved] = await waitForRole(
          session,
          { role: "button", name: await handleName(session, "row", 2) },
          UI_TIMEOUT_MS,
        );
        const back = await elementCenter(session, moved.backendNodeId);
        const above = await cellCenter(session, 1, 0);
        await dragFrom(session, back, { x: back.x, y: above.y - 12 });
        await waitForGrid(session, CHECKOUT_GRID);
        return {};
      },
    ],
    [
      "pasting spreadsheet cells creates a table",
      async ({ session }) => {
        await openNote(session, "Scratchpad");
        await session.waitUntil(
          () =>
            document
              .querySelector(".md-body-prose")
              ?.textContent.includes("Ideas that are not tied"),
          null,
          UI_TIMEOUT_MS,
        );
        await focusEditorEnd(session);
        await pressKey(session, "Enter");
        await session.run(() => {
          const data = new DataTransfer();
          data.setData("text/plain", "Item\tQty\r\nPear\t3\r\n");
          document.activeElement.dispatchEvent(
            new ClipboardEvent("paste", {
              clipboardData: data,
              bubbles: true,
              cancelable: true,
            }),
          );
        });
        await waitForGrid(session, [
          ["Item", "Qty"],
          ["Pear", "3"],
        ]);
        const header = await session.run(
          () =>
            [...document.querySelectorAll(".md-body-prose table")].pop().rows[0]
              .cells[0].tagName,
        );
        check(header === "TH", "pasted first row is not a header", header);
        return { header };
      },
    ],
    [
      "add bars add one slice on click and more on drag",
      async ({ session }) => {
        const [addRow, addColumn] = await Promise.all(
          ["notes:table.addRow", "notes:table.addColumn"].map((key) =>
            translate(session, key),
          ),
        );
        await hoverCell(session, 1, 1);
        await clickByRole(session, { role: "button", name: addRow });
        await waitForShape(session, 3, 2);
        await hoverCell(session, 1, 1);
        const [bar] = await waitForRole(
          session,
          { role: "button", name: addColumn },
          UI_TIMEOUT_MS,
        );
        const from = await elementCenter(session, bar.backendNodeId);
        const width = await session.run(
          () =>
            [...document.querySelectorAll(".md-body-prose table")]
              .pop()
              .rows[0].cells[1].getBoundingClientRect().width,
        );
        await dragFrom(session, from, { x: from.x + width * 2, y: from.y });
        await waitForShape(session, 3, 4);
        return { width };
      },
    ],
    [
      "Mod+Enter leaves the table for a paragraph below it",
      async ({ session }) => {
        await clickPoint(session, await cellCenter(session, 1, 0));
        await session.send("Input.dispatchKeyEvent", {
          type: "rawKeyDown",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          modifiers: MOD_KEY,
        });
        await session.send("Input.dispatchKeyEvent", {
          type: "keyUp",
          key: "Enter",
          code: "Enter",
          windowsVirtualKeyCode: 13,
          modifiers: MOD_KEY,
        });
        await session.send("Input.insertText", { text: "After table" });
        const placement = await session.run(() => {
          const table = [...document.querySelectorAll(".md-body-prose table")]
            .pop()
            .closest(".tableWrapper");
          const next = table.nextElementSibling;
          return {
            next: next?.tagName,
            text: next?.textContent,
            inTable: table.textContent.includes("After table"),
          };
        });
        check(
          placement.next === "P" &&
            placement.text === "After table" &&
            !placement.inTable,
          "text did not land below the table",
          placement,
        );
        return placement;
      },
    ],
    [
      "a note made of only a table accepts text above and below it",
      async ({ session }) => {
        await session.run(() =>
          document
            .querySelector(".md-body-prose")
            .editor.commands.setContent(
              "<table><tr><th><p>a</p></th><th><p>b</p></th></tr><tr><td><p>1</p></td><td><p>2</p></td></tr></table>",
            ),
        );
        const blocks = () =>
          session.run(() =>
            [...document.querySelector(".md-body-prose").children].map(
              (node) =>
                node.classList.contains("tableWrapper")
                  ? "table"
                  : `${node.tagName}:${node.textContent}`,
            ),
          );
        const table = await session.run(() =>
          document
            .querySelector(".md-body-prose .tableWrapper")
            .getBoundingClientRect()
            .toJSON(),
        );
        const below = { x: table.left + 40, y: table.bottom + 80 };
        await clickPoint(session, below);
        await session.send("Input.insertText", { text: "Below" });
        await clickPoint(session, { x: below.x, y: below.y + 120 });
        const afterBelow = await blocks();
        check(
          afterBelow.join("|") === "table|P:Below",
          "clicking below the table did not start a paragraph",
          afterBelow,
        );
        const titleLabel = await translate(session, "notes:editor.titleLabel");
        await clickByRole(session, { role: "textbox", name: titleLabel });
        await pressKey(session, "Enter");
        await session.send("Input.insertText", { text: "Above" });
        const afterAbove = await blocks();
        check(
          afterAbove.join("|") === "P:Above|table|P:Below",
          "Enter in the title did not start a paragraph above the table",
          afterAbove,
        );
        const title = await session.run(
          (name) => document.querySelector(`input[aria-label="${name}"]`).value,
          titleLabel,
        );
        check(title === "Scratchpad", "typing leaked into the title", title);
        return { blocks: afterAbove };
      },
    ],
    [
      "collapsed notes sidebar keeps the expand control in the content column",
      async ({ session }) => {
        const [collapse, expand] = await Promise.all(
          ["notes:sidebar.collapse", "notes:sidebar.expand"].map((key) =>
            translate(session, key),
          ),
        );
        await clickByRole(session, { role: "button", name: collapse });
        const [toggle] = await waitForRole(
          session,
          { role: "button", name: expand },
          UI_TIMEOUT_MS,
        );
        const layout = await session.run(() => {
          const button = document.querySelector(
            "button[aria-label][class*='size-3.5']",
          );
          const prose = document.querySelector(".md-body-prose");
          const rect = button.getBoundingClientRect();
          return {
            toggleLeft: rect.left,
            toggleTop: rect.top,
            proseLeft: prose.getBoundingClientRect().left,
          };
        });
        check(layout.toggleLeft < layout.proseLeft, "toggle overlaps body", {
          layout,
          toggle,
        });
        await clickByRole(session, { role: "button", name: expand });
        await waitForRole(
          session,
          { role: "button", name: collapse },
          UI_TIMEOUT_MS,
        );
        return layout;
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
  teardown: async ({ session }) => {
    const editorTab = await translate(session, "editor:actions.showEditor");
    await clickByRole(session, { role: "button", name: editorTab });
    return {};
  },
});
