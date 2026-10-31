import os from "node:os";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  type InstalledSkill,
  SKILL_LINK_AGENTS,
  type SkillLinkAgent,
  type SkillRef,
  type SkillTarget,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import { printResult, printRows, stringFlag } from "./parse-args";
import {
  handleSkillPackCommand,
  skillPackUsageLines,
} from "./skill-pack-commands";
import { isInside } from "./workspace-root";

type SkillAction = (args: string[], parsed: ParsedArgs) => Promise<void>;

function listFlag(parsed: ParsedArgs, name: string) {
  return (stringFlag(parsed, name) ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function requireName(args: string[], usage: string) {
  const [name] = args;
  if (!name) {
    throw new Error(`Usage: cocurdex skills ${usage}`);
  }
  return name;
}

async function resolveWorkspaceId(parsed: ParsedArgs) {
  const value = stringFlag(parsed, "workspace");
  if (!value) {
    return null;
  }
  const workspaces = await withDaemon(() => requestDaemon("workspace.list"));
  const byId = workspaces.find((workspace) => workspace.id === value);
  if (byId) {
    return byId.id;
  }
  const target = path.resolve(value);
  const byPath = workspaces.find((workspace) =>
    workspace.rootPaths.some((rootPath) => isInside(rootPath, target)),
  );
  if (!byPath) {
    throw new Error(`Workspace not found: ${value}`);
  }
  return byPath.id;
}

async function resolveTarget(parsed: ParsedArgs): Promise<SkillTarget> {
  const workspaceId = await resolveWorkspaceId(parsed);
  return workspaceId
    ? { scope: "workspace", workspaceId }
    : { scope: "global", workspaceId: null };
}

async function resolveRef(name: string, parsed: ParsedArgs): Promise<SkillRef> {
  return { ...(await resolveTarget(parsed)), name };
}

function resolveSourceArgument(source: string) {
  if (source === "~" || source.startsWith("~/") || source.startsWith("~\\")) {
    return path.join(os.homedir(), source.slice(1));
  }
  if (source.startsWith(".")) {
    return path.resolve(source);
  }
  return source;
}

function parseAgents(parsed: ParsedArgs, name: string): SkillLinkAgent[] {
  const agents = listFlag(parsed, name);
  for (const agent of agents) {
    if (!SKILL_LINK_AGENTS.includes(agent as SkillLinkAgent)) {
      throw new Error(
        `Unknown agent ${agent}; use ${SKILL_LINK_AGENTS.join(", ")}`,
      );
    }
  }
  return agents as SkillLinkAgent[];
}

function agentSummary(skill: InstalledSkill) {
  return skill.agents
    .filter((agent) => agent.access !== "none")
    .map((agent) => `${agent.agent}:${agent.access}`)
    .join(" ");
}

function updateSummary(skill: InstalledSkill) {
  if (!skill.update) {
    return "";
  }
  const commit = skill.update.latestCommit.slice(0, 7);
  return skill.update.skipped ? `skipped ${commit}` : `available ${commit}`;
}

async function listSkills(_args: string[], parsed: ParsedArgs) {
  const workspaceId = await resolveWorkspaceId(parsed);
  const list = await withDaemon(() =>
    requestDaemon("skills.list", { workspaceId }),
  );
  if (parsed.flags.has("json")) {
    printResult(list, parsed);
    return;
  }
  printRows(
    list.skills.map((skill) => ({
      name: skill.name,
      scope: skill.scope,
      source: skill.builtin ? "cocurdex" : (skill.source?.source ?? "local"),
      agents: agentSummary(skill),
      problems: skill.problems.map((problem) => problem.kind).join(","),
      update: updateSummary(skill),
    })),
    ["name", "scope", "source", "agents", "problems", "update"],
    parsed,
  );
}

async function showSkill(args: string[], parsed: ParsedArgs) {
  const ref = await resolveRef(requireName(args, "show <name>"), parsed);
  const detail = await withDaemon(() => requestDaemon("skills.show", ref));
  if (parsed.flags.has("json")) {
    printResult(detail, parsed);
    return;
  }
  const { skill } = detail;
  console.log(`name: ${skill.name}`);
  console.log(`description: ${skill.description ?? ""}`);
  console.log(`path: ${skill.path}`);
  console.log(`source: ${skill.source?.source ?? "local"}`);
  console.log(`agents: ${agentSummary(skill)}`);
  for (const problem of skill.problems) {
    console.log(`problem: ${JSON.stringify(problem)}`);
  }
  console.log("files:");
  for (const file of detail.files) {
    console.log(`  ${file.kind.padEnd(6)} ${file.path}`);
  }
}

async function searchSkills(args: string[], parsed: ParsedArgs) {
  const query = args.join(" ").trim();
  if (query.length < 2) {
    throw new Error("Usage: cocurdex skills search <query (2+ characters)>");
  }
  const limit = Number(stringFlag(parsed, "limit") ?? 30);
  const result = await withDaemon(() =>
    requestDaemon("skills.catalog.search", { query, limit }),
  );
  printRows(
    result.results.map((entry) => ({
      name: entry.name,
      source: entry.source,
      installs: entry.installs,
      add: `cocurdex skills add ${entry.source} --skill ${entry.skillId}`,
    })),
    ["name", "source", "installs", "add"],
    parsed,
  );
}

async function listSources(_args: string[], parsed: ParsedArgs) {
  const result = await withDaemon(() =>
    requestDaemon("skills.catalog.sources"),
  );
  printRows(result.sources, ["source", "title", "url"], parsed);
}

async function inspectSource(args: string[], parsed: ParsedArgs) {
  const source = resolveSourceArgument(requireName(args, "inspect <source>"));
  const snapshot = await withDaemon(() =>
    requestDaemon("skills.source.inspect", {
      source,
      ref: stringFlag(parsed, "ref") ?? null,
    }),
  );
  if (parsed.flags.has("json")) {
    printResult(snapshot, parsed);
    return;
  }
  const commit = snapshot.commit ? ` @ ${snapshot.commit.slice(0, 7)}` : "";
  console.log(`${snapshot.source}${commit}`);
  printRows(
    snapshot.skills.map((skill) => ({
      name: skill.name,
      path: skill.skillPath || ".",
      scripts: skill.scriptCount,
      issues: skill.issues.join(","),
      description: skill.description ?? "",
    })),
    ["name", "path", "scripts", "issues", "description"],
    parsed,
  );
}

function matchesSkillFlag(
  skill: { name: string; skillPath: string },
  wanted: string,
) {
  return (
    skill.skillPath === wanted ||
    skill.name === wanted ||
    path.posix.basename(skill.skillPath) === wanted
  );
}

const ADD_USAGE =
  "add <source> [--skill <name|path>[,...] | --all] [--workspace <id|path>] [--link claude-code,antigravity] [--replace <name>[,...]] [--ref <ref>]";

async function addSkills(args: string[], parsed: ParsedArgs) {
  const source = resolveSourceArgument(requireName(args, ADD_USAGE));
  const ref = stringFlag(parsed, "ref") ?? null;
  const target = await resolveTarget(parsed);
  const snapshot = await withDaemon(() =>
    requestDaemon("skills.source.inspect", { source, ref }),
  );
  const wanted = listFlag(parsed, "skill");
  const onlySkill = snapshot.skills.length === 1 && wanted.length === 0;
  const selected =
    parsed.flags.has("all") || onlySkill
      ? snapshot.skills
      : snapshot.skills.filter((skill) =>
          wanted.some((entry) => matchesSkillFlag(skill, entry)),
        );
  if (selected.length === 0) {
    const available = snapshot.skills
      .map((skill) => `  ${skill.name} (${skill.skillPath || "."})`)
      .join("\n");
    throw new Error(
      `Choose skills with --skill or --all. Available in ${snapshot.source}:\n${available}`,
    );
  }
  const result = await withDaemon(() =>
    requestDaemon("skills.add", {
      ...target,
      source,
      ref,
      skillPaths: selected.map((skill) => skill.skillPath),
      agents: parseAgents(parsed, "link"),
      replace: listFlag(parsed, "replace"),
    }),
  );
  printResult(result, parsed);
  if (result.skipped.some((entry) => entry.reason === "exists")) {
    process.exitCode = 1;
  }
}

async function removeSkill(args: string[], parsed: ParsedArgs) {
  const ref = await resolveRef(requireName(args, "remove <name>"), parsed);
  printResult(
    await withDaemon(() => requestDaemon("skills.remove", ref)),
    parsed,
  );
}

function linkAction(enabled: boolean): SkillAction {
  return async (args, parsed) => {
    const verb = enabled ? "link" : "unlink";
    const usage = `${verb} <name> --agent ${SKILL_LINK_AGENTS.join("|")}`;
    const ref = await resolveRef(requireName(args, usage), parsed);
    const [agent] = parseAgents(parsed, "agent");
    if (!agent) {
      throw new Error(`Usage: cocurdex skills ${usage}`);
    }
    const detail = await withDaemon(() =>
      requestDaemon("skills.setAgentLink", { ...ref, agent, enabled }),
    );
    printResult(
      parsed.flags.has("json")
        ? detail
        : { agents: agentSummary(detail.skill) },
      parsed,
    );
  };
}

async function shareSkill(args: string[], parsed: ParsedArgs) {
  const ref = await resolveRef(requireName(args, "share <name>"), parsed);
  const detail = await withDaemon(() => requestDaemon("skills.share", ref));
  printResult(
    parsed.flags.has("json") ? detail : { path: detail.skill.path },
    parsed,
  );
}

async function dedupeSkill(args: string[], parsed: ParsedArgs) {
  const usage = "dedupe <name> --keep <path>";
  const ref = await resolveRef(requireName(args, usage), parsed);
  const keep = stringFlag(parsed, "keep");
  if (!keep) {
    throw new Error(`Usage: cocurdex skills ${usage}`);
  }
  const detail = await withDaemon(() =>
    requestDaemon("skills.resolveDuplicate", {
      ...ref,
      keepPath: path.resolve(keep),
    }),
  );
  printResult(
    parsed.flags.has("json") ? detail : { path: detail.skill.path },
    parsed,
  );
}

async function checkUpdates(_args: string[], parsed: ParsedArgs) {
  const workspaceId = await resolveWorkspaceId(parsed);
  const result = await withDaemon(() =>
    requestDaemon("skills.updates.check", { workspaceId }),
  );
  if (parsed.flags.has("json")) {
    printResult(result, parsed);
    return;
  }
  printRows(
    result.updates.map((update) => ({
      name: update.name,
      scope: update.scope,
      source: update.source,
      latest: update.latestCommit.slice(0, 7),
      skipped: update.skipped ? "yes" : "",
    })),
    ["name", "scope", "source", "latest", "skipped"],
    parsed,
  );
  for (const failure of result.failures) {
    console.error(`${failure.source}: ${failure.error}`);
  }
}

async function diffSkill(args: string[], parsed: ParsedArgs) {
  const ref = await resolveRef(requireName(args, "diff <name>"), parsed);
  const preview = await withDaemon(() =>
    requestDaemon("skills.updates.preview", ref),
  );
  if (parsed.flags.has("json")) {
    printResult(preview, parsed);
    return;
  }
  const latest = preview.latestCommit.slice(0, 7);
  console.log(`${preview.name} -> ${preview.source}@${latest}`);
  if (preview.localModified) {
    console.log("Local edits will be replaced (a backup is kept).");
  }
  for (const change of preview.changes) {
    console.log(
      `${change.status} ${change.path} +${change.additions} -${change.deletions}`,
    );
    if (change.patch && parsed.flags.has("patch")) {
      console.log(change.patch);
    }
  }
}

async function pendingUpdateNames(target: SkillTarget) {
  const result = await withDaemon(() =>
    requestDaemon("skills.updates.check", {
      workspaceId: target.workspaceId,
    }),
  );
  return result.updates
    .filter((update) => update.scope === target.scope && !update.skipped)
    .map((update) => update.name);
}

async function updateSkills(args: string[], parsed: ParsedArgs) {
  const target = await resolveTarget(parsed);
  const all = parsed.flags.has("all");
  const names = all ? await pendingUpdateNames(target) : args;
  if (names.length === 0 && !all) {
    throw new Error("Usage: cocurdex skills update <name...> | --all");
  }
  if (names.length === 0) {
    printResult({ updated: [] }, parsed);
    return;
  }
  printResult(
    await withDaemon(() =>
      requestDaemon("skills.updates.apply", {
        skills: names.map((name) => ({ ...target, name })),
      }),
    ),
    parsed,
  );
}

async function skipUpdate(args: string[], parsed: ParsedArgs) {
  const ref = await resolveRef(requireName(args, "skip <name>"), parsed);
  const detail = await withDaemon(() => requestDaemon("skills.show", ref));
  const latestCommit = detail.skill.update?.latestCommit;
  if (!latestCommit) {
    throw new Error(
      `${ref.name} has no known update; run cocurdex skills updates first`,
    );
  }
  printResult(
    await withDaemon(() =>
      requestDaemon("skills.updates.skip", { ...ref, latestCommit }),
    ),
    parsed,
  );
}

const SKILL_ACTIONS: Record<string, SkillAction> = {
  list: listSkills,
  show: showSkill,
  search: searchSkills,
  sources: listSources,
  inspect: inspectSource,
  add: addSkills,
  remove: removeSkill,
  link: linkAction(true),
  unlink: linkAction(false),
  share: shareSkill,
  dedupe: dedupeSkill,
  updates: checkUpdates,
  diff: diffSkill,
  update: updateSkills,
  skip: skipUpdate,
};

export async function handleSkillsCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (action === "pack") {
    const [packAction, ...rest] = args;
    return handleSkillPackCommand(packAction, rest, parsed);
  }
  const handler = action ? SKILL_ACTIONS[action] : undefined;
  if (!handler) {
    return false;
  }
  await handler(args, parsed);
  return true;
}

export function skillsUsageLines(): string[] {
  return [
    "  cocurdex skills list [--workspace <id|path>] [--json]",
    "  cocurdex skills show <name> [--workspace <id|path>] [--json]",
    "  cocurdex skills search <query> [--limit <n>] [--json]",
    "  cocurdex skills sources [--json]",
    "  cocurdex skills inspect <owner/repo|github-url|folder> [--ref <ref>] [--json]",
    `  cocurdex skills ${ADD_USAGE} [--json]`,
    "  cocurdex skills remove <name> [--workspace <id|path>] [--json]",
    "  cocurdex skills link|unlink <name> --agent claude-code|antigravity [--workspace <id|path>] [--json]",
    "  cocurdex skills share <name> [--workspace <id|path>] [--json]",
    "  cocurdex skills dedupe <name> --keep <path> [--workspace <id|path>] [--json]",
    "  cocurdex skills updates [--workspace <id|path>] [--json]",
    "  cocurdex skills diff <name> [--workspace <id|path>] [--patch] [--json]",
    "  cocurdex skills update <name...> | --all [--workspace <id|path>] [--json]",
    "  cocurdex skills skip <name> [--workspace <id|path>] [--json]",
    ...skillPackUsageLines(),
  ];
}
