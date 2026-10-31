import { existsSync, lstatSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  type DaemonProcess,
  spawnDaemon,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";

const tempDirs = createTempDirs();
afterAll(() => tempDirs.cleanup());

const now = "2026-10-20T00:00:00.000Z";

function writeSkill(root: string, name: string, description: string) {
  mkdirSync(path.join(root, name), { recursive: true });
  writeFileSync(
    path.join(root, name, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n`,
  );
}

function isolatedHome(home: string): NodeJS.ProcessEnv {
  return {
    HOME: home,
    USERPROFILE: home,
    CLAUDE_CONFIG_DIR: "",
    CODEX_HOME: "",
    XDG_CONFIG_HOME: "",
    XDG_STATE_HOME: "",
  };
}

describe("cocurdex skills against a running daemon", () => {
  let daemon: DaemonProcess;
  let home: string;
  let workspace: string;
  let source: string;

  beforeAll(async () => {
    home = tempDirs.createSync("cocu-skill-home-");
    workspace = tempDirs.createSync("cocu-skill-ws-");
    source = tempDirs.createSync("cocu-skill-src-");
    writeSkill(source, "deploy", "Ship the app");
    writeSkill(source, "triage", "Sort incoming bugs");
    daemon = await spawnDaemon({ env: isolatedHome(home) });
    await requestDaemon(
      "workspace.save",
      {
        workspace: {
          id: "skills-workspace",
          name: "acme-shop",
          rootPaths: [workspace],
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
          sortOrder: 0,
        },
      },
      daemon.options,
    );
  });

  afterAll(async () => {
    await daemon.dispose();
  });

  const cli = (args: string[]) =>
    runCli(args, {
      userDataPath: daemon.userDataPath,
      env: isolatedHome(home),
    });

  it("manages the cocurdex pack through the daemon", async () => {
    const listed = await cli(["skills", "pack", "list", "--json"]);
    expect(listed.code).toBe(0);
    const pack = JSON.parse(listed.stdout);
    expect(pack.sourceAvailable).toBe(true);
    expect(pack.skills).toContain("cocurdex-skills");
    expect(
      pack.packSkills.every(
        (skill: { description: string | null }) => skill.description,
      ),
    ).toBe(true);

    const nested = path.join(workspace, "src", "app");
    mkdirSync(nested, { recursive: true });
    const project = ["--scope", "project", "--root", nested, "--json"];
    const installed = await cli(["skills", "pack", "install", ...project]);
    expect(installed.code).toBe(0);
    expect(JSON.parse(installed.stdout)).toMatchObject({
      action: "installed",
      workspaceRoot: workspace,
    });
    const skillFile = path.join(
      workspace,
      ".agents",
      "skills",
      "cocurdex-skills",
      "SKILL.md",
    );
    writeFileSync(skillFile, "edited\n");
    const status = await cli(["skills", "pack", "status", ...project]);
    expect(JSON.parse(status.stdout)).toMatchObject({
      installed: true,
      modified: true,
    });
    const restored = await cli(["skills", "pack", "install", ...project]);
    expect(JSON.parse(restored.stdout)).toMatchObject({
      action: "restored",
      modified: false,
    });

    const removed = await cli(["skills", "pack", "remove", ...project]);
    expect(JSON.parse(removed.stdout)).toMatchObject({ removed: true });
    expect(existsSync(skillFile)).toBe(false);

    const outside = tempDirs.createSync("cocu-skill-outside-");
    const refused = await cli([
      "skills",
      "pack",
      "install",
      "--scope",
      "project",
      "--root",
      outside,
    ]);
    expect(refused.code).not.toBe(0);
    expect(refused.stderr).toContain("No registered workspace contains");
    expect(existsSync(path.join(outside, ".agents"))).toBe(false);
  });

  it("inspects a folder, installs into a workspace, links, lists, and removes", async () => {
    const inspected = await cli(["skills", "inspect", source, "--json"]);
    expect(inspected.code).toBe(0);
    expect(
      JSON.parse(inspected.stdout).skills.map(
        (skill: { name: string }) => skill.name,
      ),
    ).toEqual(["deploy", "triage"]);

    const ambiguous = await cli([
      "skills",
      "add",
      source,
      "--workspace",
      workspace,
    ]);
    expect(ambiguous.code).not.toBe(0);
    expect(ambiguous.stderr).toContain("Choose skills with --skill or --all");

    const added = await cli([
      "skills",
      "add",
      source,
      "--skill",
      "deploy",
      "--workspace",
      workspace,
      "--link",
      "claude-code",
      "--json",
    ]);
    expect(added.code).toBe(0);
    expect(JSON.parse(added.stdout)).toEqual({
      installed: ["deploy"],
      skipped: [],
    });
    expect(
      lstatSync(
        path.join(workspace, ".claude", "skills", "deploy"),
      ).isSymbolicLink(),
    ).toBe(true);
    const lock = JSON.parse(
      await readFile(path.join(workspace, "skills-lock.json"), "utf8"),
    );
    expect(lock.skills.deploy).toMatchObject({ source, sourceType: "local" });

    const listed = await cli([
      "skills",
      "list",
      "--workspace",
      workspace,
      "--json",
    ]);
    const deploy = JSON.parse(listed.stdout).skills.find(
      (skill: { name: string }) => skill.name === "deploy",
    );
    expect(deploy).toMatchObject({
      scope: "workspace",
      workspaceId: "skills-workspace",
      agents: [
        { agent: "shared", access: "native" },
        { agent: "claude-code", access: "link" },
      ],
    });

    const unlinked = await cli([
      "skills",
      "unlink",
      "deploy",
      "--agent",
      "claude-code",
      "--workspace",
      workspace,
    ]);
    expect(unlinked.code).toBe(0);
    expect(
      existsSync(path.join(workspace, ".claude", "skills", "deploy")),
    ).toBe(false);

    const removed = await cli([
      "skills",
      "remove",
      "deploy",
      "--workspace",
      workspace,
      "--json",
    ]);
    expect(JSON.parse(removed.stdout)).toEqual({ removed: true });
    expect(
      existsSync(path.join(workspace, ".agents", "skills", "deploy")),
    ).toBe(false);
  });

  it("installs globally under the daemon's home and refuses to overwrite", async () => {
    const args = ["skills", "add", source, "--skill", "triage", "--json"];
    expect((await cli(args)).code).toBe(0);
    expect(
      existsSync(path.join(home, ".agents", "skills", "triage", "SKILL.md")),
    ).toBe(true);

    const again = await cli(args);
    expect(again.code).toBe(1);
    expect(JSON.parse(again.stdout).skipped).toEqual([
      { name: "triage", reason: "exists" },
    ]);
  });
});
