import { copyFile, rm } from "node:fs/promises";
import path from "node:path";
import { PDF_FIXTURES } from "./fixtures/index.mjs";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { openWorkspaceFile } from "./lib/file-tree.mjs";
import { openEditorPanel, showPanelView, translate } from "./lib/navigate.mjs";

const PDF_REQUEST_FRAGMENT = "/files/pdf";
const MISSING_PDF_NAME = "__scenario-missing__.pdf";
const ABORTED_FULL_REQUEST_STATUS = 0;
const UI_TIMEOUT_MS = 30_000;
const POSITION_PERSIST_WAIT_MS = 1_000;
const SEARCH_SETTLE_MS = 1_000;
const SEARCH_SETTLE_TIMEOUT_MS = 60_000;
const RANGE_STATUSES = new Set([200, 206, ABORTED_FULL_REQUEST_STATUS]);

const args = readScenarioArgs({
  pdf: { type: "string" },
  fixture: { type: "string", default: "sample" },
  page: { type: "string" },
  query: { type: "string" },
});

if (args.port && !args.pdf) {
  console.error(
    "Usage: node tests/scenarios/pdf-reader.mjs [--fixture sample|book] [--port <cdp port> --pdf <path relative to the active workspace> [--url URL]] [--page N] [--query TEXT]",
  );
  process.exit(2);
}

const fixture = args.pdf ? null : PDF_FIXTURES[args.fixture];
if (!args.pdf && !fixture) {
  console.error(
    `Unknown --fixture ${args.fixture}; use ${Object.keys(PDF_FIXTURES).join(", ")}`,
  );
  process.exit(2);
}

const DEFAULT_PAGE = 10;
const query = args.query ?? fixture?.query ?? null;
const expectedMatches = args.query ? null : (fixture?.matches ?? null);
const targetPage = args.page
  ? Number.parseInt(args.page, 10)
  : (fixture?.page ?? DEFAULT_PAGE);

function requestSummary(requests) {
  return {
    requests: requests.length,
    statuses: [...new Set(requests.map((request) => request.status))],
    networkMs: Math.round(
      requests.reduce((total, request) => total + request.duration, 0),
    ),
  };
}

function checkRangeRequests(requests, step) {
  const unexpected = requests.filter(
    (request) => !RANGE_STATUSES.has(request.status),
  );
  check(
    unexpected.length === 0,
    `${step}: unexpected PDF statuses`,
    unexpected,
  );
}

async function readRequests(session) {
  return session.run(
    (fragment) =>
      window.__scenario.requests(fragment).map((entry) => ({
        status: entry.responseStatus,
        duration: entry.duration,
      })),
    PDF_REQUEST_FRAGMENT,
  );
}

async function pdfLabels(session, fileName) {
  const keys = {
    goToPage: "editor:pdf.goToPage",
    search: "editor:pdf.search",
    searchClose: "editor:pdf.searchClose",
    toggleSearch: "editor:pdf.toggleSearch",
    toggleThumbnails: "editor:pdf.toggleThumbnails",
  };
  const labels = {};
  for (const [name, key] of Object.entries(keys)) {
    labels[name] = await translate(session, key);
  }
  return {
    ...labels,
    closeFile: (name) =>
      translate(session, "editor:actions.closeFile", { fileName: name }),
    closeThis: await translate(session, "editor:actions.closeFile", {
      fileName,
    }),
  };
}

async function readViewerState(session, labels, name) {
  const closeLabel = await labels.closeFile(name);
  return session.run(
    ({ closeLabel, goToPage }) => {
      const S = window.__scenario;
      return {
        tabOpen: Boolean(S.byLabel(closeLabel)),
        viewerOpen: Boolean(document.querySelector(".pdfViewer")),
        page: S.byLabel(goToPage)?.value ?? null,
      };
    },
    { closeLabel, goToPage: labels.goToPage },
  );
}

async function closePdfTab(session, labels, name) {
  const closeLabel = await labels.closeFile(name);
  await session.run((label) => {
    window.__scenario.byLabel(label)?.click();
    return true;
  }, closeLabel);
  await session.waitUntil(
    (label) => !window.__scenario.byLabel(label),
    closeLabel,
    UI_TIMEOUT_MS,
  );
}

async function goToPage(session, labels, page) {
  await session.run(
    ({ page, label }) => {
      const S = window.__scenario;
      const input = S.byLabel(label);
      input.focus();
      S.setInput(input, String(page));
      S.pressEnter(input);
      input.blur();
      return true;
    },
    { page, label: labels.goToPage },
  );
  await session.waitUntil(
    ({ page }) => {
      const element = document.querySelector(
        `.pdfViewer .page[data-page-number="${page}"]`,
      );
      return Boolean(element?.querySelector("canvas"));
    },
    { page },
  );
}

async function readMatchTotal(session, labels) {
  return session.run((label) => {
    const input = window.__scenario.byLabel(label);
    const counter =
      input?.parentElement?.parentElement?.innerText.match(
        /(\d+)\s*\/\s*(\d+)/,
      );
    return counter ? Number(counter[2]) : 0;
  }, labels.search);
}

async function waitForStableMatchCount(session, labels) {
  const deadline = Date.now() + SEARCH_SETTLE_TIMEOUT_MS;
  let previous = -1;
  while (Date.now() < deadline) {
    const total = await readMatchTotal(session, labels);
    if (total > 0 && total === previous) return total;
    previous = total;
    await session.run((ms) => window.__scenario.sleep(ms), SEARCH_SETTLE_MS);
  }
  throw new Error("search: match count did not settle");
}

async function resetRequests(session) {
  await session.run(() => {
    window.__scenario.resetRequests();
    return true;
  });
}

runScenario("pdf-reader", {
  open: () =>
    openScenarioApp(args, { fixtures: fixture ? [fixture.path] : [] }),
  async setup({ session, files }) {
    const relativePath = fixture
      ? path.basename(files[fixture.path])
      : args.pdf.split(path.sep).join("/");
    const fileName = path.posix.basename(relativePath);
    const labels = await pdfLabels(session, fileName);
    await openEditorPanel(session);
    const initial = await readViewerState(session, labels, fileName);
    await resetRequests(session);
    await openWorkspaceFile(session, relativePath);
    await session.waitUntil(
      () => document.querySelectorAll(".pdfViewer canvas").length > 0,
      null,
      20_000,
    );
    const opened = await readViewerState(session, labels, fileName);
    return {
      relativePath,
      fileName,
      labels,
      initial,
      initialPage: opened.page,
    };
  },
  steps: [
    [
      "open",
      async ({ session }) => {
        const requests = await readRequests(session);
        checkRangeRequests(requests, "open");
        const blobUrls = await session.run(
          () =>
            performance
              .getEntriesByType("resource")
              .filter((entry) => entry.name.startsWith("blob:")).length,
        );
        check(blobUrls === 0, "open: PDF loaded through a blob URL");
        return requestSummary(requests);
      },
    ],
    [
      "jump-to-page",
      async ({ session, labels }) => {
        await resetRequests(session);
        await goToPage(session, labels, targetPage);
        await session.waitUntil(
          ({ page }) =>
            document.querySelectorAll(
              `.pdfViewer .page[data-page-number="${page}"] .textLayer span`,
            ).length > 0,
          { page: targetPage },
        );
        const textSpans = await session.run(
          ({ page }) =>
            document.querySelectorAll(
              `.pdfViewer .page[data-page-number="${page}"] .textLayer span`,
            ).length,
          { page: targetPage },
        );
        const requests = await readRequests(session);
        checkRangeRequests(requests, "jump-to-page");
        return { page: targetPage, textSpans, ...requestSummary(requests) };
      },
    ],
    [
      "search",
      async ({ session, labels }) => {
        await resetRequests(session);
        const searched = await session.run(
          async ({ query, page, labels }) => {
            const S = window.__scenario;
            const fallback = [
              ...document.querySelectorAll(
                `.pdfViewer .page[data-page-number="${page}"] .textLayer span`,
              ),
            ]
              .map((span) => span.textContent.trim())
              .find((text) => /^[\p{L}\p{N}]{3,}$/u.test(text));
            const text = query ?? fallback;
            S.byLabel(labels.toggleSearch).click();
            await S.sleep(200);
            const input = S.byLabel(labels.search);
            input.focus();
            S.setInput(input, text);
            S.pressEnter(input);
            return text;
          },
          { query, page: targetPage, labels },
        );
        check(Boolean(searched), "search: no query available");
        await session.waitUntil(
          (label) => {
            const input = window.__scenario.byLabel(label);
            const bar = input?.parentElement?.parentElement;
            const counter = bar?.innerText.match(/(\d+)\s*\/\s*(\d+)/);
            return Boolean(counter && Number(counter[2]) > 0);
          },
          labels.search,
          30_000,
        );
        await waitForStableMatchCount(session, labels);
        const result = await session.run((labels) => {
          const S = window.__scenario;
          const input = S.byLabel(labels.search);
          const counter =
            input.parentElement.parentElement.innerText.match(
              /(\d+)\s*\/\s*(\d+)/,
            );
          const highlights = document.querySelectorAll(
            ".textLayer .highlight",
          ).length;
          S.byLabel(labels.searchClose).click();
          return { matches: Number(counter[2]), highlights };
        }, labels);
        check(result.highlights > 0, "search: no highlighted matches");
        if (expectedMatches !== null) {
          check(
            result.matches === expectedMatches,
            "search: unexpected match count",
            { expected: expectedMatches, actual: result.matches },
          );
        }
        const requests = await readRequests(session);
        checkRangeRequests(requests, "search");
        return { query: searched, ...result, ...requestSummary(requests) };
      },
    ],
    [
      "thumbnails",
      async ({ session, labels }) => {
        await session.run((label) => {
          window.__scenario.byLabel(label).click();
          return true;
        }, labels.toggleThumbnails);
        await session.waitUntil(
          () =>
            document.querySelectorAll(
              'img[src^="data:image"], img[src^="blob:"]',
            ).length > 0,
        );
        const thumbnails = await session.run((label) => {
          const count = document.querySelectorAll(
            'img[src^="data:image"], img[src^="blob:"]',
          ).length;
          window.__scenario.byLabel(label).click();
          return count;
        }, labels.toggleThumbnails);
        return { thumbnails };
      },
    ],
    [
      "reopen-restores-position",
      async ({ session, relativePath, fileName, labels }) => {
        const before = await readViewerState(session, labels, fileName);
        const expectedPage = Number(before.page);
        await session.run(
          (ms) => window.__scenario.sleep(ms),
          POSITION_PERSIST_WAIT_MS,
        );
        await closePdfTab(session, labels, fileName);
        const closed = await readViewerState(session, labels, fileName);
        check(!closed.tabOpen, "reopen: tab did not close");
        await resetRequests(session);
        const startedAt = Date.now();
        await openWorkspaceFile(session, relativePath);
        await session.waitUntil(
          ({ page }) =>
            Boolean(
              document
                .querySelector(`.pdfViewer .page[data-page-number="${page}"]`)
                ?.querySelector("canvas"),
            ),
          { page: expectedPage },
          20_000,
        );
        const firstPaintMs = Date.now() - startedAt;
        const reopened = await readViewerState(session, labels, fileName);
        check(
          reopened.page === String(expectedPage),
          "reopen: reading position not restored",
          reopened,
        );
        const requests = await readRequests(session);
        checkRangeRequests(requests, "reopen");
        return {
          firstPaintMs,
          page: reopened.page,
          ...requestSummary(requests),
        };
      },
    ],
    [
      "pdf-deleted-while-closed-shows-error",
      async ({ session, workspaceRoot, labels }) => {
        if (!workspaceRoot) return { skipped: "attached to a running app" };
        const missingPath = path.join(workspaceRoot, MISSING_PDF_NAME);
        await copyFile(fixture.path, missingPath);
        await showPanelView(session, "files");
        await openWorkspaceFile(session, MISSING_PDF_NAME);
        await session.waitUntil(
          () => document.querySelectorAll(".pdfViewer canvas").length > 0,
          null,
          20_000,
        );
        await rm(missingPath);
        await session.reload();
        await resetRequests(session);
        await showPanelView(session, "pdf");
        const missingTab = await labels.closeFile(MISSING_PDF_NAME);
        await session.waitUntil(
          (label) => Boolean(window.__scenario.byLabel(label)),
          missingTab,
          UI_TIMEOUT_MS,
        );
        await session.waitUntil(
          (fragment) =>
            window.__scenario
              .requests(fragment)
              .some((entry) => entry.responseStatus === 404),
          PDF_REQUEST_FRAGMENT,
          UI_TIMEOUT_MS,
        );
        const errorTitle = await translate(
          session,
          "editor:pdf.loadErrorTitle",
        );
        await session.waitUntil(
          (text) => document.body.innerText.includes(text),
          errorTitle,
          UI_TIMEOUT_MS,
        );
        const viewerOpen = await session.run(() =>
          Boolean(document.querySelector(".pdfViewer canvas")),
        );
        check(!viewerOpen, "missing file: viewer rendered pages");
        await closePdfTab(session, labels, MISSING_PDF_NAME);
        return { status: 404 };
      },
    ],
    [
      "no-page-errors",
      async ({ session }) => {
        const errors = await session.run(() => window.__scenario.errors);
        check(errors.length === 0, "page errors were raised", errors);
        return {};
      },
    ],
  ],
  async teardown({
    session,
    isolated,
    relativePath,
    fileName,
    labels,
    initial,
    initialPage,
  }) {
    if (isolated) return { restored: "isolated instance discarded" };
    if (!initial.tabOpen) {
      await closePdfTab(session, labels, fileName);
      return { restored: "closed the PDF tab opened by the scenario" };
    }
    const state = await readViewerState(session, labels, fileName);
    if (!state.viewerOpen) await openWorkspaceFile(session, relativePath);
    if (initialPage) await goToPage(session, labels, Number(initialPage));
    return { restored: `page ${initialPage}` };
  },
});
