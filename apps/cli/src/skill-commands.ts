import {
  getProductSkillsPackVersion,
  getProductSkillsStatus,
  installProductSkills,
  PRODUCT_SKILL_NAMES,
  removeProductSkills,
  type SkillScope,
} from "@cocurdex/product-skills";
import type { ParsedArgs } from "./parse-args";
import { printResult, stringFlag } from "./parse-args";

function resolveRoot(parsed: ParsedArgs): string {
  return stringFlag(parsed, "root") ?? process.cwd();
}

function parseScope(parsed: ParsedArgs): SkillScope {
  const value = stringFlag(parsed, "scope");
  if (value === "project" || value === "global") {
    return value;
  }
  throw new Error("Missing or invalid --scope (project|global)");
}

export async function handleSkillsCommand(
  action: string | undefined,
  _args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (!action) {
    return false;
  }

  if (action === "list") {
    const payload = {
      packVersion: getProductSkillsPackVersion(),
      skills: [...PRODUCT_SKILL_NAMES],
    };
    if (parsed.flags.has("json")) {
      printResult(payload, parsed);
    } else {
      console.log(`packVersion: ${payload.packVersion}`);
      for (const name of payload.skills) {
        console.log(name);
      }
    }
    return true;
  }

  if (action === "status") {
    const scope = parseScope(parsed);
    const root = scope === "project" ? resolveRoot(parsed) : undefined;
    const status = await getProductSkillsStatus(scope, root);
    printResult(status, parsed);
    return true;
  }

  if (action === "install") {
    const scope = parseScope(parsed);
    const root = scope === "project" ? resolveRoot(parsed) : undefined;
    const result = await installProductSkills(scope, root);
    if (result.action === "conflict") {
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
      return true;
    }
    printResult(result, parsed);
    return true;
  }

  if (action === "remove" || action === "uninstall") {
    const scope = parseScope(parsed);
    const root = scope === "project" ? resolveRoot(parsed) : undefined;
    const result = await removeProductSkills(scope, root);
    printResult(result, parsed);
    return true;
  }

  return false;
}

export function skillsUsageLines(): string[] {
  return [
    "  cocurdex skills list [--json]",
    "  cocurdex skills status --scope project|global [--root <path>] [--json]",
    "  cocurdex skills install --scope project|global [--root <path>] [--json]",
    "  cocurdex skills remove --scope project|global [--root <path>] [--json]",
  ];
}
