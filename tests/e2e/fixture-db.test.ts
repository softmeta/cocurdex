import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import { docImageUri, findDocImages } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  type InstalledFixture,
  installFixtureDb,
} from "@cocurdex/test-harness/fixture-db/install";
import {
  FIXTURE_DECKS,
  FIXTURE_ISSUES,
  FIXTURE_MISSING_CHECKOUT_PATH,
  FIXTURE_MULTI_FOLDER_WORKSPACE_ID,
  FIXTURE_NOTES,
  FIXTURE_TEAM_SESSION,
  FIXTURE_TEAMMATE_TOOL_CALLS,
  FIXTURE_WORKSPACE_ID,
} from "@cocurdex/test-harness/fixture-db/recipe";
import {
  findSensitiveText,
  scanForSensitiveData,
} from "@cocurdex/test-harness/fixture-db/sensitive-data";
import {
  type DaemonProcess,
  spawnDaemon,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();
let fixture: InstalledFixture;
let userDataPath: string;
let daemon: DaemonProcess;

beforeAll(async () => {
  const root = await tempDirs.create("cfx-");
  userDataPath = path.join(root, "u");
  fixture = await installFixtureDb({
    userDataPath,
    workspaceParent: path.join(root, "w"),
  });
}, 120_000);

afterAll(async () => {
  await daemon?.stop();
  await tempDirs.cleanup();
});

describe("sensitive data scanner", () => {
  it("flags home paths, foreign emails, and credential shapes", () => {
    const rules = findSensitiveText(
      "sample",
      [
        "/Users/someone/project",
        "C:\\Users\\someone\\project",
        "dev@company.io",
        "sk-abcdefghijklmnopqrstu",
        "ghp_abcdefghijklmnopqrstuvwxyz",
        "xoxb-1234567890-abc",
        "AKIAABCDEFGHIJKLMNOP",
        "-----BEGIN OPENSSH PRIVATE KEY-----",
        "Authorization: Bearer abc.def.ghi.jkl",
      ].join("\n"),
    ).map((finding) => finding.rule);
    expect(new Set(rules)).toEqual(
      new Set([
        "posix home path",
        "windows home path",
        "email",
        "openai key",
        "github token",
        "slack token",
        "aws access key",
        "private key",
        "bearer token",
      ]),
    );
  });

  it("allows reserved example domains and the stub credentials", () => {
    expect(
      findSensitiveText(
        "sample",
        "fixture@example.invalid Bearer e2e-key /fixture/w/acme-shop",
      ),
    ).toEqual([]);
  });
});

describe("fixture database", () => {
  it("contains no machine paths, identities, or credentials", async () => {
    expect(await scanForSensitiveData(userDataPath)).toEqual([]);
  });

  it("installs a multi-folder workspace whose folders all exist", async () => {
    const suite = fixture.installedWorkspaces.find(
      (workspace) => workspace.id === FIXTURE_MULTI_FOLDER_WORKSPACE_ID,
    );
    expect(suite?.rootPaths.map((rootPath) => path.basename(rootPath))).toEqual(
      ["acme-web", "acme-docs"],
    );
    daemon = await spawnDaemon({ userDataPath });
    const [stored] = (
      await requestDaemon("workspace.list", daemon.options)
    ).filter((candidate) => candidate.id === FIXTURE_MULTI_FOLDER_WORKSPACE_ID);
    expect(stored?.rootPaths).toHaveLength(2);
    const relinked = await requestDaemon(
      "workspace.save",
      { workspace: { ...stored, rootPaths: suite?.rootPaths ?? [] } },
      daemon.options,
    );
    expect(relinked.missingRootPaths).toEqual([]);
    await daemon.stop();
  });

  it("opens in a fresh daemon with every seeded record", async () => {
    daemon = await spawnDaemon({ userDataPath });
    const [workspace] = (
      await requestDaemon("workspace.list", daemon.options)
    ).filter((candidate) => candidate.id === FIXTURE_WORKSPACE_ID);
    const relinked = await requestDaemon(
      "workspace.save",
      { workspace: { ...workspace, rootPaths: [fixture.workspacePath] } },
      daemon.options,
    );
    expect(relinked.missingRootPaths).toEqual([]);

    const sessions = await requestDaemon("session.list", daemon.options);
    const archived = await requestDaemon(
      "session.listArchived",
      daemon.options,
    );
    expect(
      [...sessions, ...archived].map((session) => session.id).sort(),
    ).toEqual([...fixture.sessionIds].sort());
    expect(archived.map((session) => session.id)).toEqual([
      "fixture-session-old-spike",
    ]);
    expect(
      sessions.find((session) => session.id === "fixture-session-discounts")
        ?.pinnedAt,
    ).toBeTruthy();

    const toolCalls = await requestDaemon(
      "session.listToolCalls",
      { sessionId: "fixture-session-discounts" },
      daemon.options,
    );
    expect(toolCalls.map((call) => [call.title, call.status])).toEqual([
      ["read", "completed"],
      ["read", "completed"],
      ["write", "completed"],
      ["read", "completed"],
    ]);
    const failed = await requestDaemon(
      "session.listToolCalls",
      { sessionId: "fixture-session-checkout-bug" },
      daemon.options,
    );
    expect(failed.map((call) => call.status)).toEqual(["failed"]);

    const tree = await requestDaemon(
      "session.executionTree",
      { sessionId: FIXTURE_TEAM_SESSION.id },
      daemon.options,
    );
    const runs = tree?.root.runs ?? [];
    expect(runs.at(0)?.toolCalls.map((node) => node.toolCall.status)).toEqual([
      "completed",
    ]);
    expect(
      runs
        .at(-1)
        ?.toolCalls.map((node) => [
          node.toolCall.status,
          node.toolCall.rawInput,
        ]),
    ).toEqual([
      ["completed", { path: "src/cart.ts" }],
      ["failed", { path: FIXTURE_MISSING_CHECKOUT_PATH }],
      ["completed", { path: "src/discount.ts" }],
    ]);
    expect(
      runs.slice(1, -1).map((node) => [node.run.status, node.toolCalls]),
    ).toEqual([
      ["completed", []],
      ["completed", []],
    ]);
    const byTitle = (left: { title: string }, right: { title: string }) =>
      left.title.localeCompare(right.title);
    expect(
      (tree?.root.children ?? [])
        .map((child) => ({
          title: child.session.title,
          statuses: child.runs.flatMap((run) =>
            run.toolCalls.map((node) => node.toolCall.status),
          ),
        }))
        .sort(byTitle),
    ).toEqual(
      (FIXTURE_TEAM_SESSION.teammates ?? [])
        .map((teammate) => ({
          title: teammate.name,
          statuses: [
            ...Array(FIXTURE_TEAMMATE_TOOL_CALLS - 1).fill("completed"),
            "failed",
          ],
        }))
        .sort(byTitle),
    );

    const { messages } = await requestDaemon(
      "session.listMessages",
      { sessionId: "fixture-session-discounts" },
      daemon.options,
    );
    expect(
      messages.filter((message) => message.role === "user").map((m) => m.id),
    ).toEqual(["fixture-message-discounts-1", "fixture-message-discounts-2"]);

    const notes = await requestDaemon("note.list", daemon.options);
    expect(notes.map((note) => note.title).sort()).toEqual(
      FIXTURE_NOTES.map((note) => note.title).sort(),
    );

    const decks = await requestDaemon("deck.list", daemon.options);
    expect(decks.map((deck) => deck.title).sort()).toEqual(
      FIXTURE_DECKS.map((deck) => deck.title).sort(),
    );
    const [deck] = decks;
    const issues = await requestDaemon(
      "deck.check",
      { id: deck?.id ?? "" },
      daemon.options,
    );
    expect(issues).toEqual([]);

    const [view] = await requestDaemon("issue.listViews", daemon.options);
    const board = await requestDaemon(
      "issue.loadView",
      { viewId: view?.id ?? "" },
      daemon.options,
    );
    expect(board?.issues.map((issue) => issue.title).sort()).toEqual(
      FIXTURE_ISSUES.map((issue) => issue.title).sort(),
    );
    expect(board?.labels.map((label) => label.name).sort()).toEqual([
      "bug",
      "checkout",
      "feature",
    ]);

    const records = await Promise.all(
      (board?.issues ?? []).map((issue) =>
        requestDaemon("issue.get", { id: issue.id }, daemon.options),
      ),
    );
    const imageNames = records.flatMap((issue) =>
      findDocImages(issue?.description ?? "").map((image) => image.fileName),
    );
    expect(imageNames).toHaveLength(
      FIXTURE_ISSUES.filter((issue) => issue.image).length,
    );
    for (const fileName of imageNames) {
      const located = await requestDaemon(
        "image.locate",
        { uri: docImageUri(fileName) },
        daemon.options,
      );
      expect(located?.fileName).toBe(fileName);
    }
  });
});
