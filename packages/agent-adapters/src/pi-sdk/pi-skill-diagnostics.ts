import { existsSync, lstatSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { COCURDEX_DAEMON_DIAGNOSTIC_PREFIX } from "@cocurdex/shared";

interface PiSkillRootSnapshot {
  entryCount?: number;
  error?: string;
  exists: boolean;
  isDirectory?: boolean;
  isSymbolicLink?: boolean;
  path: string;
  role: string;
  scanned: boolean;
}

function getAdditionalSkillCandidates(workspaceRootPath: string) {
  return [
    path.join(workspaceRootPath, ".agents", "skills"),
    path.join(homedir(), ".agents", "skills"),
  ];
}

export function resolveAdditionalSkillPaths(
  workspaceRootPath: string,
): string[] {
  return getAdditionalSkillCandidates(workspaceRootPath).filter((directory) =>
    existsSync(directory),
  );
}

function inspectSkillRoot(
  rootPath: string,
  role: string,
  scanned: boolean,
): PiSkillRootSnapshot {
  try {
    const linkStats = lstatSync(rootPath);
    const targetStats = statSync(rootPath);
    const isDirectory = targetStats.isDirectory();

    return {
      entryCount: isDirectory ? readdirSync(rootPath).length : undefined,
      exists: true,
      isDirectory,
      isSymbolicLink: linkStats.isSymbolicLink(),
      path: rootPath,
      role,
      scanned,
    };
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String(error.code)
        : undefined;
    return {
      error: code ?? (error instanceof Error ? error.message : String(error)),
      exists: false,
      path: rootPath,
      role,
      scanned,
    };
  }
}

export function getPiSkillRootSnapshots(options: {
  agentDir: string;
  workspaceRootPath: string;
}): PiSkillRootSnapshot[] {
  const { agentDir, workspaceRootPath } = options;

  return [
    inspectSkillRoot(path.join(agentDir, "skills"), "cocurdex-pi-global", true),
    inspectSkillRoot(
      path.join(workspaceRootPath, ".pi", "skills"),
      "pi-project",
      true,
    ),
    inspectSkillRoot(
      path.join(homedir(), ".pi", "agent", "skills"),
      "standalone-pi-global",
      false,
    ),
    ...getAdditionalSkillCandidates(workspaceRootPath).map((rootPath, index) =>
      inspectSkillRoot(
        rootPath,
        index === 0 ? "agents-project" : "agents-global",
        existsSync(rootPath),
      ),
    ),
  ];
}

export function logPiSkillDiagnostic(
  event: string,
  details: Record<string, unknown>,
) {
  console.info(
    `${COCURDEX_DAEMON_DIAGNOSTIC_PREFIX}${JSON.stringify({
      event,
      ...details,
    })}`,
  );
}
