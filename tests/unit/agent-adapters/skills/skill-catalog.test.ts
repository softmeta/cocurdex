import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { listAgentSkills } from "@cocurdex/agent-adapters/internal/skills/skill-catalog";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import { afterAll, describe, expect, it } from "vitest";

const tempDirs = createTempDirs();

afterAll(() => tempDirs.cleanup());

async function writeSkill(
  rootPath: string,
  directoryName: string,
  name: string,
  description: string,
) {
  const skillPath = path.join(rootPath, directoryName);
  await mkdir(skillPath, { recursive: true });
  await writeFile(
    path.join(skillPath, "SKILL.md"),
    `---\nname: ${name}\ndescription: ${description}\n---\n`,
    "utf8",
  );
}

describe("listAgentSkills", () => {
  it("discovers standard skills and maps native invocation syntax", async () => {
    const rootPath = await tempDirs.create("cocurdex-skills-");
    const homePath = path.join(rootPath, "home");
    const workspaceRootPath = path.join(rootPath, "workspace");
    await writeSkill(
      path.join(workspaceRootPath, ".agents", "skills"),
      "review",
      "review",
      "Review the current change",
    );

    const codexSkills = await listAgentSkills(
      "codex",
      { workspaceRootPath },
      { homePath },
    );
    const openCodeSkills = await listAgentSkills(
      "opencode",
      { workspaceRootPath },
      { homePath },
    );

    expect(codexSkills).toEqual([
      {
        name: "review",
        description: "Review the current change",
        invocation: "$review ",
        source: "skill",
      },
    ]);
    expect(openCodeSkills[0]?.invocation).toBe("Use the `review` skill. ");
  });

  it("discovers skills nested below an agent-owned root", async () => {
    const rootPath = await tempDirs.create("cocurdex-skills-");
    const homePath = path.join(rootPath, "home");
    const workspaceRootPath = path.join(rootPath, "workspace");
    await writeSkill(
      path.join(homePath, ".codex", "skills", ".system"),
      "skill-creator",
      "skill-creator",
      "Create a reusable skill",
    );

    const skills = await listAgentSkills(
      "codex",
      { workspaceRootPath },
      { homePath },
    );

    expect(skills[0]?.name).toBe("skill-creator");
    expect(skills[0]?.invocation).toBe("$skill-creator ");
  });

  it("lets an agent-specific workspace skill override a global standard skill", async () => {
    const rootPath = await tempDirs.create("cocurdex-skills-");
    const homePath = path.join(rootPath, "home");
    const workspaceRootPath = path.join(rootPath, "workspace");
    await writeSkill(
      path.join(homePath, ".agents", "skills"),
      "review",
      "review",
      "Global description",
    );
    await writeSkill(
      path.join(workspaceRootPath, ".claude", "skills"),
      "review",
      "review",
      "Workspace description",
    );

    const skills = await listAgentSkills(
      "claude-agent",
      { workspaceRootPath },
      { homePath },
    );

    expect(skills).toHaveLength(1);
    expect(skills[0]?.description).toBe("Workspace description");
    expect(skills[0]?.invocation).toBe("/review ");
  });
});
