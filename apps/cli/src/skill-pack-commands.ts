import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import type {
  ProductSkillScope,
  ProductSkillsRequestPayload,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import type { ParsedArgs } from "./parse-args";
import { printResult, stringFlag } from "./parse-args";
import { findWorkspaceRootPath } from "./workspace-root";

function parseScope(parsed: ParsedArgs): ProductSkillScope {
  const value = stringFlag(parsed, "scope");
  if (value === "project" || value === "global") {
    return value;
  }
  throw new Error("Missing or invalid --scope (project|global)");
}

async function resolvePayload(
  parsed: ParsedArgs,
): Promise<ProductSkillsRequestPayload> {
  const scope = parseScope(parsed);
  if (scope === "global") {
    return { scope, workspaceRootPath: null };
  }
  const target = path.resolve(stringFlag(parsed, "root") ?? process.cwd());
  return { scope, workspaceRootPath: await findWorkspaceRootPath(target) };
}

async function listPack(parsed: ParsedArgs) {
  const status = await withDaemon(() =>
    requestDaemon("skills.pack.getStatus", {
      scope: "global",
      workspaceRootPath: null,
    }),
  );
  const payload = {
    packVersion: status.packVersion,
    sourceAvailable: status.sourceAvailable,
    skills: status.packSkills.map((skill) => skill.name),
    packSkills: status.packSkills,
  };
  if (parsed.flags.has("json")) {
    printResult(payload, parsed);
    return;
  }
  for (const skill of status.packSkills) {
    console.log(`${skill.name}\t${skill.description ?? ""}`);
  }
}

async function installPack(parsed: ParsedArgs) {
  const payload = await resolvePayload(parsed);
  const result = await withDaemon(() =>
    requestDaemon("skills.pack.install", payload),
  );
  if (result.action !== "conflict") {
    printResult(result, parsed);
    return;
  }
  const message = [
    "Conflict: product skills already exist without a Cocurdex managed marker.",
    `Paths: ${result.agentsSkillsDir}`,
    `Skills: ${result.conflictSkills.join(", ")}`,
    "Remove or rename them, then retry.",
  ].join("\n");
  if (parsed.flags.has("json")) {
    printResult({ ...result, error: message }, parsed);
  } else {
    console.error(message);
  }
  process.exitCode = 1;
}

async function showPackSkill(args: string[], parsed: ParsedArgs) {
  const name = args[0];
  if (!name) {
    throw new Error("Usage: cocurdex skills pack show <name>");
  }
  const detail = await withDaemon(() =>
    requestDaemon("skills.pack.show", { name }),
  );
  if (parsed.flags.has("json")) {
    printResult(detail, parsed);
    return;
  }
  console.log(detail.document?.content ?? "");
}

type PackAction = (parsed: ParsedArgs, args: string[]) => Promise<void>;

const PACK_ACTIONS: Record<string, PackAction> = {
  list: listPack,
  show: (parsed, args) => showPackSkill(args, parsed),
  status: async (parsed) => {
    const payload = await resolvePayload(parsed);
    printResult(
      await withDaemon(() => requestDaemon("skills.pack.getStatus", payload)),
      parsed,
    );
  },
  install: installPack,
  remove: async (parsed) => {
    const payload = await resolvePayload(parsed);
    printResult(
      await withDaemon(() => requestDaemon("skills.pack.remove", payload)),
      parsed,
    );
  },
};

export async function handleSkillPackCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  const handler =
    action === "uninstall" ? PACK_ACTIONS.remove : PACK_ACTIONS[action ?? ""];
  if (!handler) {
    return false;
  }
  await handler(parsed, args);
  return true;
}

export function skillPackUsageLines(): string[] {
  return [
    "  cocurdex skills pack list [--json]",
    "  cocurdex skills pack show <name> [--json]",
    "  cocurdex skills pack status --scope project|global [--root <path>] [--json]",
    "  cocurdex skills pack install --scope project|global [--root <path>] [--json]",
    "  cocurdex skills pack remove --scope project|global [--root <path>] [--json]",
  ];
}
