import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clickPoint } from "./lib/locate.mjs";
import { closeEditorPanel, showPanelView } from "./lib/navigate.mjs";

const LISTING_LIMIT = 5000;
const FILLER_DIRECTORY_COUNT = LISTING_LIMIT + 100;
const UI_TIMEOUT_MS = 60_000;
const LOADED_ROWS = ["zzz/", "zzz/auth/", "zzz/auth/token.ts", "zzz/README.md"];

const args = readScenarioArgs();

async function seedLargeWorkspace(root) {
  const filler = path.join(root, "aaa-filler");
  await mkdir(filler);
  for (let start = 0; start < FILLER_DIRECTORY_COUNT; start += 200) {
    await Promise.all(
      Array.from(
        { length: Math.min(200, FILLER_DIRECTORY_COUNT - start) },
        (_, offset) => mkdir(path.join(filler, `d${start + offset}`)),
      ),
    );
  }
  await mkdir(path.join(root, "zzz", "auth"), { recursive: true });
  await writeFile(path.join(root, "zzz", "README.md"), "# zzz\n");
  await writeFile(path.join(root, "zzz", "auth", "token.ts"), "x\n");
}

function findTreeRow(itemPath) {
  const roots = [document];
  for (const root of roots) {
    const row = [...root.querySelectorAll("[role=treeitem][data-item-path]")]
      .filter((element) => element.dataset.itemParked !== "true")
      .find((element) => element.dataset.itemPath === itemPath);
    if (row) {
      row.scrollIntoView({ block: "center" });
      const bounds = row.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        return {
          x: bounds.x + bounds.width / 2,
          y: bounds.y + bounds.height / 2,
        };
      }
    }
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }
  return false;
}

function findFirstTreeRow(itemPaths) {
  const shown = new Set();
  const roots = [document];
  for (const root of roots) {
    for (const row of root.querySelectorAll("[data-item-path]")) {
      shown.add(row.dataset.itemPath);
    }
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }
  return itemPaths.find((itemPath) => shown.has(itemPath)) ?? false;
}

function treeRowsGone(itemPaths) {
  const roots = [document];
  for (const root of roots) {
    for (const row of root.querySelectorAll("[data-item-path]")) {
      if (itemPaths.includes(row.dataset.itemPath)) return false;
    }
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }
  return true;
}

function watchTreeRows(itemPaths) {
  const missing = new Set();
  const sample = () => {
    const shown = new Set();
    const roots = [document];
    for (const root of roots) {
      for (const row of root.querySelectorAll("[data-item-path]")) {
        shown.add(row.dataset.itemPath);
      }
      for (const element of root.querySelectorAll("*")) {
        if (element.shadowRoot) roots.push(element.shadowRoot);
      }
    }
    for (const itemPath of itemPaths) {
      if (!shown.has(itemPath)) missing.add(itemPath);
    }
    window.__treeRowWatch.frame = requestAnimationFrame(sample);
  };
  window.__treeRowWatch = { missing, frame: requestAnimationFrame(sample) };
  return true;
}

function stopWatchingTreeRows() {
  cancelAnimationFrame(window.__treeRowWatch.frame);
  return [...window.__treeRowWatch.missing];
}

function treeFolderExpanded(itemPath) {
  const roots = [document];
  for (const root of roots) {
    const row = [...root.querySelectorAll("[role=treeitem][data-item-path]")]
      .filter((element) => element.dataset.itemParked !== "true")
      .find((element) => element.dataset.itemPath === itemPath);
    if (row) return row.getAttribute("aria-expanded") === "true";
    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }
  return false;
}

async function expandFolder(session, itemPath) {
  const deadline = Date.now() + UI_TIMEOUT_MS;
  while (!(await session.run(treeFolderExpanded, itemPath))) {
    const remaining = deadline - Date.now();
    check(remaining > 0, "folder did not expand", { itemPath });
    await session.waitUntil(findTreeRow, itemPath, remaining);
    const point = await session.run(findTreeRow, itemPath);
    if (!point) continue;
    await clickPoint(session, point);
    await session
      .waitUntil(treeFolderExpanded, itemPath, 5_000)
      .catch(() => {});
  }
}

async function expandNestedFolder(session, parentPath, childPath) {
  await session.waitUntil(
    findFirstTreeRow,
    [childPath, parentPath],
    UI_TIMEOUT_MS,
  );
  const shown = await session.run(findFirstTreeRow, [childPath, parentPath]);
  if (shown === parentPath) await expandFolder(session, parentPath);
  await expandFolder(session, childPath);
}

runScenario("file-tree-large-workspace", {
  open: () => openScenarioApp(args),
  async setup(opened) {
    await seedLargeWorkspace(opened.workspaceRoot);
    const { wasOpen } = await showPanelView(opened.session, "files");
    return { panelWasOpen: wasOpen, workspaceRoot: opened.workspaceRoot };
  },
  steps: [
    [
      "a folder the capped listing missed still shows its files",
      async ({ session }) => {
        await expandNestedFolder(session, "zzz/", "zzz/auth/");
        await session.waitUntil(
          findTreeRow,
          "zzz/auth/token.ts",
          UI_TIMEOUT_MS,
        );
        await session.waitUntil(findTreeRow, "zzz/README.md", UI_TIMEOUT_MS);
        return {};
      },
    ],
    [
      "a listing refresh keeps the loaded folder open without flicker",
      async ({ session, workspaceRoot }) => {
        await session.run(watchTreeRows, LOADED_ROWS);
        await writeFile(path.join(workspaceRoot, "zzz", "late.ts"), "x\n");
        await session.waitUntil(findTreeRow, "zzz/late.ts", UI_TIMEOUT_MS);
        const missing = await session.run(stopWatchingTreeRows);
        check(
          missing.length === 0,
          "loaded rows disappeared during the refresh",
          { missing },
        );
        return {};
      },
    ],
    [
      "a deleted loaded folder leaves the tree",
      async ({ session, workspaceRoot }) => {
        await rm(path.join(workspaceRoot, "zzz", "auth"), { recursive: true });
        await session.waitUntil(
          treeRowsGone,
          ["zzz/auth/", "zzz/auth/token.ts"],
          UI_TIMEOUT_MS,
        );
        return {};
      },
    ],
  ],
  teardown: async ({ session, panelWasOpen }) => {
    if (!panelWasOpen) await closeEditorPanel(session);
    return {};
  },
});
