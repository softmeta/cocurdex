import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./lib/appearance.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import { clickByRole } from "./lib/locate.mjs";
import { translate } from "./lib/navigate.mjs";

const require = createRequire(
  new URL("../harness/package.json", import.meta.url),
);
const { tsImport } = await import(require.resolve("tsx/esm/api"));
const { startStubLlmServer } = await tsImport(
  require.resolve("@cocurdex/test-harness/helpers/llm-stub"),
  import.meta.url,
);
const { createProviderSnapshotForModel } = await tsImport(
  require.resolve("@cocurdex/shared"),
  import.meta.url,
);
const args = readScenarioArgs();
const answer = `Stream verification begins. ${"中文与 emoji 👩🏽‍💻 remain readable. ".repeat(12)} Stream verification finished.`;
let stub;

function startRecorder() {
  const record = { frames: [], nodes: new Set(), done: false };
  window.__streamRecorder = record;
  const sample = () => {
    const node = [...document.querySelectorAll("article p")].find((el) =>
      el.textContent.startsWith("Stream verification begins."),
    );
    if (node) {
      record.nodes.add(node);
      record.frames.push({
        at: performance.now(),
        length: node.textContent.length,
        fading: node.querySelectorAll("[data-stream-fade]").length,
      });
    }
    if (!record.done) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

function readingState() {
  const viewport = [
    ...document.querySelectorAll("[data-slot=scroll-area-viewport]"),
  ].find((node) => node.querySelector("[data-testid=chat-timeline]"));
  if (!viewport) return null;
  return {
    top: viewport.scrollTop,
    height: viewport.scrollHeight,
    viewport: viewport.clientHeight,
    length: viewport.textContent.length,
  };
}

function jumpControlLayout(label) {
  const button = [...document.querySelectorAll("button")].find(
    (node) => node.getAttribute("aria-label") === label,
  );
  const viewport = [
    ...document.querySelectorAll("[data-slot=scroll-area-viewport]"),
  ].find((node) => node.querySelector("[data-testid=chat-timeline]"));
  if (!button || !viewport) return null;
  const control = button.getBoundingClientRect();
  const area = viewport.getBoundingClientRect();
  const column = viewport
    .querySelector("[data-testid=chat-timeline]")
    .getBoundingClientRect();
  return {
    centerOffset:
      control.left + control.width / 2 - (column.left + column.width / 2),
    bottomGap: area.bottom - control.bottom,
    width: control.width,
    height: control.height,
  };
}

async function waitForJumpToSettle() {
  const end = document.querySelector("[data-transcript-content-end]");
  const viewport = end?.closest("[data-slot=scroll-area-viewport]");
  if (!viewport) throw new Error("Missing transcript viewport");
  let previous = viewport.scrollTop;
  let stableSince = performance.now();
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    await new Promise(requestAnimationFrame);
    const next = viewport.scrollTop;
    if (Math.abs(next - previous) > 0.5) stableSince = performance.now();
    if (performance.now() - stableSince > 200) return;
    previous = next;
  }
  throw new Error("Explicit jump did not settle");
}

const createdSessionIds = [];

async function configureScenarioSession(session, payload) {
  const configured = await daemonRequest(session, "session.configure", payload);
  createdSessionIds.push(configured.id);
  return configured;
}

runScenario("chat-streaming", {
  open: () => openScenarioApp(args, { fixtureDb: true }),
  setup: async ({ session }) => {
    stub = await startStubLlmServer();
    const now = new Date().toISOString();
    const provider = {
      id: "stream-scenario",
      name: "Stream scenario",
      baseUrl: stub.baseUrl,
      enabled: true,
      apiKeySecretId: null,
      headersJson: JSON.stringify({ Authorization: "Bearer synthetic-key" }),
      createdAt: now,
      updatedAt: now,
    };
    const model = {
      providerId: provider.id,
      modelId: "stream-model",
      name: "Stream model",
      api: "openai-completions",
      enabled: true,
      source: "manual",
      capabilities: ["chat", "agent"],
      createdAt: now,
      updatedAt: now,
    };
    await daemonRequest(session, "provider.config.save", { config: provider });
    await daemonRequest(session, "provider.model.save", { model });
    const workspaces = await daemonRequest(session, "workspace.list");
    const workspace =
      workspaces.find((item) => item.name === "acme-shop") ?? workspaces[0];
    return {
      workspaceId: workspace.id,
      providerSnapshot: createProviderSnapshotForModel({ provider, model }),
    };
  },
  steps: [
    [
      "continuous streams remain current and retain their paragraph through completion in both themes",
      async ({ session, workspaceId, providerSnapshot }) => {
        const reports = [];
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          const title = `Streaming ${theme}`;
          const configured = await configureScenarioSession(session, {
            id: crypto.randomUUID(),
            workspaceId,
            sessionKind: "main",
            title,
            agentType: "pi",
            writeMode: "read-only",
            sessionModeId: null,
            providerSnapshot,
          });
          await clickByRole(
            session,
            { role: "button", name: new RegExp(`^${title}`) },
            30_000,
          );
          await session.waitUntil(
            () =>
              ![...document.querySelectorAll("article p")].some((node) =>
                node.textContent.startsWith("Stream verification begins."),
              ),
            null,
            30_000,
          );
          stub.plan = {
            kind: "script",
            turns: [
              {
                text: ["Checking the fixture."],
                toolCalls: [
                  { name: "read", arguments: { path: "package.json" } },
                ],
              },
              {
                text: [
                  ...new Intl.Segmenter(undefined, {
                    granularity: "grapheme",
                  }).segment(answer),
                ].map((part) => part.segment),
                intervalMs: 16,
              },
            ],
          };
          await session.run(startRecorder);
          await daemonRequest(session, "session.send", {
            sessionId: configured.id,
            messageId: crypto.randomUUID(),
            content: "Read the fixture and stream the result.",
            attachments: [],
          });
          await session.waitUntil(
            () =>
              document.body.textContent.includes(
                "Stream verification finished.",
              ),
            null,
            30_000,
          );
          await session.waitUntil(
            () => document.querySelectorAll("[data-streaming]").length === 0,
            null,
            30_000,
          );
          const report = await session.run(() => {
            const record = window.__streamRecorder;
            record.done = true;
            return {
              frames: record.frames,
              nodes: record.nodes.size,
              errors: window.__scenario.errors,
            };
          });
          check(
            report.frames.length > 10,
            "stream did not render progressively",
            report,
          );
          check(
            report.nodes === 1,
            "answer paragraph remounted at completion",
            report,
          );
          const first = report.frames[0];
          const last = report.frames.at(-1);
          check(
            first.length < answer.length / 2,
            "first paint waited for most of the answer",
            { first, last },
          );
          check(last.length === answer.length, "stream lost content", {
            last,
            expected: answer.length,
          });
          check(report.errors.length === 0, "renderer errors", report.errors);
          const maxGrowth = Math.max(
            ...report.frames
              .slice(1)
              .map(
                (frame, index) => frame.length - report.frames[index].length,
              ),
          );
          const maxFading = Math.max(
            ...report.frames.map((frame) => frame.fading),
          );
          check(maxGrowth < 80, "stream accumulated a large visible jump", {
            maxGrowth,
          });
          check(
            maxFading <= 8,
            "stream accumulated too many active fade fragments",
            { maxFading },
          );
          const artifacts = process.env.COCURDEX_TEST_ARTIFACTS_DIR;
          if (artifacts) {
            await mkdir(artifacts, { recursive: true });
            const shot = await session.send("Page.captureScreenshot", {
              format: "png",
            });
            await writeFile(
              path.join(artifacts, `chat-streaming-${theme}.png`),
              Buffer.from(shot.data, "base64"),
            );
          }
          reports.push({
            theme,
            frames: report.frames.length,
            firstLength: first.length,
            finalLength: last.length,
            paragraphMounts: report.nodes,
            maxGrowth,
            maxFading,
          });
        }
        await clearColorScheme(session);
        return { themes: reports };
      },
    ],
    [
      "stream growth preserves reading position before and after a manual jump",
      async ({ session, workspaceId, providerSnapshot }) => {
        const reports = [];
        const jumpLabel = await translate(session, "common:jumpToLatest");
        const respondingLabel = await translate(
          session,
          "agent:activity.responding",
        );
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          const title = `Reading control ${theme}`;
          const configured = await configureScenarioSession(session, {
            id: crypto.randomUUID(),
            workspaceId,
            sessionKind: "main",
            title,
            agentType: "pi",
            writeMode: "read-only",
            sessionModeId: null,
            providerSnapshot,
          });
          await clickByRole(
            session,
            { role: "button", name: new RegExp(`^${title}`) },
            30_000,
          );
          const sections = (from, to) =>
            Array.from(
              { length: to - from },
              (_, index) =>
                `Reading section ${from + index + 1}. New content must not move the reader's viewport while this reply grows.\n\n`,
            )
              .join("")
              .match(/[\s\S]{1,24}/g);
          const measured = Promise.withResolvers();
          const jumpedHold = Promise.withResolvers();
          stub.plan = {
            kind: "stream",
            chunks: [
              `${title} begins.\n\n`,
              ...sections(0, 40),
              measured.promise,
              ...sections(40, 55),
              jumpedHold.promise,
              ...sections(55, 70),
              "Reading control finished.",
            ],
            intervalMs: 80,
          };
          await daemonRequest(session, "session.send", {
            sessionId: configured.id,
            messageId: crypto.randomUUID(),
            content: "Check manual reading control.",
            attachments: [],
          });
          await session.waitUntil(
            (opening) => {
              const viewport = [
                ...document.querySelectorAll(
                  "[data-slot=scroll-area-viewport]",
                ),
              ].find((node) =>
                node.querySelector("[data-testid=chat-timeline]"),
              );
              return (
                viewport?.textContent.includes(opening) &&
                viewport.scrollHeight > viewport.clientHeight * 1.5
              );
            },
            `${title} begins.`,
            30_000,
          );
          const hasRespondingLabel = await session.run((label) => {
            const timeline = document.querySelector(
              '[data-testid="chat-timeline"]',
            );
            return [...(timeline?.querySelectorAll("span") ?? [])].some(
              (node) => node.textContent === label,
            );
          }, respondingLabel);
          check(
            !hasRespondingLabel,
            "streaming text must not have a redundant responding status line",
          );
          const before = await session.run(readingState);
          measured.resolve();
          await session.waitUntil(
            (length) => {
              const viewport = [
                ...document.querySelectorAll(
                  "[data-slot=scroll-area-viewport]",
                ),
              ].find((node) =>
                node.querySelector("[data-testid=chat-timeline]"),
              );
              return viewport && viewport.textContent.length > length + 400;
            },
            before.length,
            30_000,
          );
          const grown = await session.run(readingState);
          check(
            Math.abs(grown.top - before.top) <= 1,
            "stream moved the reading position",
            { before, grown },
          );
          const jumpIcons = (label) => {
            const button = [...document.querySelectorAll("button")].find(
              (node) => node.getAttribute("aria-label") === label,
            );
            const indicator = button?.querySelector("[data-stream-indicator]");
            const arrow = [...(button?.querySelectorAll("svg") ?? [])].find(
              (node) => node !== indicator,
            );
            if (!button || !indicator || !arrow) return null;
            const rect = button.getBoundingClientRect();
            return {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              indicatorShown: getComputedStyle(indicator).display !== "none",
              arrowShown: getComputedStyle(arrow).display !== "none",
            };
          };
          const resting = await session.run(jumpIcons, jumpLabel);
          check(
            resting?.indicatorShown && !resting.arrowShown,
            "streaming must show the ellipsis instead of the arrow",
            resting,
          );
          await session.send("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x: resting.x,
            y: resting.y,
          });
          const hovered = await session.run(jumpIcons, jumpLabel);
          check(
            hovered && !hovered.indicatorShown && hovered.arrowShown,
            "hovering the streaming jump control must reveal the arrow",
            hovered,
          );
          const ringArtifacts = process.env.COCURDEX_TEST_ARTIFACTS_DIR;
          if (ringArtifacts) {
            const shot = await session.send("Page.captureScreenshot", {
              format: "png",
            });
            await writeFile(
              path.join(ringArtifacts, `stream-jump-hover-${theme}.png`),
              Buffer.from(shot.data, "base64"),
            );
          }
          await session.send("Input.dispatchMouseEvent", {
            type: "mouseMoved",
            x: 0,
            y: 0,
          });
          await emulateColorScheme(session, theme);
          const jumpLayout = await session.run(jumpControlLayout, jumpLabel);
          check(
            jumpLayout && Math.abs(jumpLayout.centerOffset) <= 8,
            "jump control must sit centered under the conversation column",
            jumpLayout,
          );
          check(
            jumpLayout.bottomGap >= 12 && jumpLayout.bottomGap <= 24,
            "jump control must sit just above the composer",
            jumpLayout,
          );
          await clickByRole(session, { role: "button", name: jumpLabel });
          await session.run(waitForJumpToSettle);
          const jumped = await session.run(readingState);
          jumpedHold.resolve();
          check(
            jumped.top > grown.top,
            "explicit jump did not reach new content",
            { grown, jumped },
          );
          await session.waitUntil(
            (length) => {
              const viewport = [
                ...document.querySelectorAll(
                  "[data-slot=scroll-area-viewport]",
                ),
              ].find((node) =>
                node.querySelector("[data-testid=chat-timeline]"),
              );
              return viewport && viewport.textContent.length > length + 400;
            },
            jumped.length,
            30_000,
          );
          const afterJump = await session.run(readingState);
          check(
            Math.abs(afterJump.top - jumped.top) <= 1,
            "manual jump rearmed automatic following",
            { jumped, afterJump },
          );
          await session.waitUntil(
            () =>
              document.body.textContent.includes("Reading control finished."),
            null,
            60_000,
          );
          await session.waitUntil(
            () => document.querySelectorAll("[data-streaming]").length === 0,
            null,
            30_000,
          );
          const stopped = await session.run((label) => {
            const button = [...document.querySelectorAll("button")].find(
              (node) => node.getAttribute("aria-label") === label,
            );
            return button?.querySelector("[data-stream-indicator]") !== null;
          }, jumpLabel);
          check(
            stopped === false,
            "completed reply kept the streaming indicator",
            {
              stopped,
            },
          );
          const artifacts = process.env.COCURDEX_TEST_ARTIFACTS_DIR;
          if (artifacts) {
            const shot = await session.send("Page.captureScreenshot", {
              format: "png",
            });
            await writeFile(
              path.join(artifacts, `jump-control-${theme}.png`),
              Buffer.from(shot.data, "base64"),
            );
          }
          const resizedLayouts = [];
          const topLabel = await translate(session, "common:jumpToTop");
          for (const width of [960, 1280]) {
            await session.send("Emulation.setDeviceMetricsOverride", {
              width,
              height: 800,
              deviceScaleFactor: 1,
              mobile: false,
            });
            await session.waitUntil(
              (width) => window.innerWidth === width,
              width,
            );
            await clickByRole(session, { role: "button", name: jumpLabel });
            await session.run(waitForJumpToSettle);
            const controlsAtLatest = await session.run(
              (labels) =>
                [...document.querySelectorAll("button")].filter((node) =>
                  labels.includes(node.getAttribute("aria-label")),
                ).length,
              [jumpLabel, topLabel],
            );
            check(
              controlsAtLatest === 0,
              "the latest message must not show a jump control",
              { width, controlsAtLatest },
            );
            const point = await session.run(() => {
              const area = [
                ...document.querySelectorAll(
                  "[data-slot=scroll-area-viewport]",
                ),
              ]
                .find((node) =>
                  node.querySelector("[data-testid=chat-timeline]"),
                )
                .getBoundingClientRect();
              return {
                x: area.x + area.width / 2,
                y: area.y + area.height / 2,
              };
            });
            await session.send("Input.dispatchMouseEvent", {
              type: "mouseWheel",
              ...point,
              deltaX: 0,
              deltaY: -400,
            });
            await session.waitUntil(
              (label) =>
                [...document.querySelectorAll("button")].some(
                  (node) => node.getAttribute("aria-label") === label,
                ),
              topLabel,
            );
            const topLayout = await session.run(jumpControlLayout, topLabel);
            check(
              Math.abs(topLayout.centerOffset) <= 8 &&
                topLayout.bottomGap === 16,
              "top control must stay centered above the composer after resize",
              { width, topLayout },
            );
            await clickByRole(session, { role: "button", name: topLabel });
            await session.waitUntil(() => {
              const viewport = [
                ...document.querySelectorAll(
                  "[data-slot=scroll-area-viewport]",
                ),
              ].find((node) =>
                node.querySelector("[data-testid=chat-timeline]"),
              );
              return viewport?.scrollTop === 0;
            });
            const latestLayout = await session.run(
              jumpControlLayout,
              jumpLabel,
            );
            check(
              Math.abs(latestLayout.centerOffset) <= 8 &&
                latestLayout.bottomGap === topLayout.bottomGap,
              "both directions must share the same slot",
              { width, topLayout, latestLayout },
            );
            resizedLayouts.push({ width, topLayout, latestLayout });
          }
          await session.send("Emulation.clearDeviceMetricsOverride");
          reports.push({
            theme,
            before,
            grown,
            jumped,
            afterJump,
            jumpLayout,
            resizedLayouts,
          });
        }
        await clearColorScheme(session);
        return { themes: reports };
      },
    ],
    [
      "live status sits in the activity group header, never below the stream",
      async ({ session, workspaceId, providerSnapshot }) => {
        const reports = [];
        const [planningLabel, thinkingLabel] = await Promise.all([
          translate(session, "agent:activity.planning"),
          translate(session, "agent:activity.thinking"),
        ]);
        const liveStatus = (labels) => {
          const timeline = document.querySelector(
            '[data-testid="chat-timeline"]',
          );
          const nodes = [...(timeline?.querySelectorAll("span") ?? [])].filter(
            (node) => [labels].flat().includes(node.textContent),
          );
          return nodes.map((node) => ({
            inGroupHeader: node.closest("button[aria-expanded]") !== null,
          }));
        };
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          const title = `Live status ${theme}`;
          const configured = await configureScenarioSession(session, {
            id: crypto.randomUUID(),
            workspaceId,
            sessionKind: "main",
            title,
            agentType: "pi",
            writeMode: "read-only",
            sessionModeId: null,
            providerSnapshot,
          });
          await clickByRole(
            session,
            { role: "button", name: new RegExp(`^${title}`) },
            30_000,
          );
          stub.plan = { kind: "hang" };
          const hangRequests = stub.requests.length;
          await daemonRequest(session, "session.send", {
            sessionId: configured.id,
            messageId: crypto.randomUUID(),
            content: "Wait before doing anything.",
            attachments: [],
          });
          while (stub.requests.length <= hangRequests) {
            await stub.nextRequest();
          }
          await session.waitUntil(
            (label) =>
              [
                ...(document
                  .querySelector('[data-testid="chat-timeline"]')
                  ?.querySelectorAll("span") ?? []),
              ].some((node) => node.textContent === label),
            planningLabel,
            30_000,
          );
          const beforeWork = await session.run(liveStatus, planningLabel);
          check(
            beforeWork.length === 1 && !beforeWork[0].inGroupHeader,
            "a turn without process shows one live status row",
            beforeWork,
          );
          await daemonRequest(session, "session.stop", {
            sessionId: configured.id,
          });

          const requests = stub.requests.length;
          stub.plan = {
            kind: "script",
            turns: [
              {
                toolCalls: [
                  { name: "read", arguments: { path: "package.json" } },
                ],
              },
              {
                toolCalls: [{ name: "read", arguments: { path: "README.md" } }],
              },
            ],
          };
          await daemonRequest(session, "session.send", {
            sessionId: configured.id,
            messageId: crypto.randomUUID(),
            content: "Read two files, then keep thinking.",
            attachments: [],
          });
          while (stub.requests.length < requests + 2) {
            await stub.nextRequest();
          }
          stub.plan = { kind: "hang" };
          const workingLabels = [planningLabel, thinkingLabel];
          await session.waitUntil(
            (labels) =>
              [
                ...(document
                  .querySelector('[data-testid="chat-timeline"]')
                  ?.querySelectorAll("button[aria-expanded] span") ?? []),
              ].some((node) => labels.includes(node.textContent)),
            workingLabels,
            30_000,
          );
          const duringWork = await session.run(liveStatus, workingLabels);
          check(
            duringWork.length === 1 && duringWork[0].inGroupHeader,
            "live status must replace the latest group header, not trail it",
            duringWork,
          );
          await daemonRequest(session, "session.stop", {
            sessionId: configured.id,
          });
          reports.push({ theme, beforeWork, duringWork });
        }
        await clearColorScheme(session);
        return { themes: reports };
      },
    ],
  ],
  teardown: async ({ session }) => {
    await stub?.close();
    for (const sessionId of createdSessionIds) {
      await daemonRequest(session, "session.delete", { sessionId });
    }
    return { deletedSessions: createdSessionIds.length };
  },
});
