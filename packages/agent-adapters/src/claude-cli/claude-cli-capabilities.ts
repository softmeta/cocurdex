import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { DiscoveredAgentCapabilities } from "@cocurdex/agent-core";
import type {
  AgentPermissionModeOption,
  AgentPermissionModeRisk,
} from "@cocurdex/shared";

const execFileAsync = promisify(execFile);

export type RunClaudeCliCommand = (
  executablePath: string,
  args: string[],
) => Promise<{ stdout: string }>;

interface ClaudePermissionModeCandidate {
  id: AgentPermissionModeOption["id"];
  risk: AgentPermissionModeRisk;
  runtimeMode: string;
}

const ESTABLISHED_PERMISSION_MODES = [
  { id: "claude-default", risk: "normal", runtimeMode: "default" },
  {
    id: "claude-accept-edits",
    risk: "elevated",
    runtimeMode: "acceptEdits",
  },
  {
    id: "claude-bypass-permissions",
    risk: "dangerous",
    runtimeMode: "bypassPermissions",
  },
] as const satisfies readonly ClaudePermissionModeCandidate[];

// 不探测 dontAsk：那是官方给 CI / 脚本用的「未预批则拒绝」，不是交互式少询问。
const PERMISSION_MODE_CANDIDATES = [
  ESTABLISHED_PERMISSION_MODES[0],
  ESTABLISHED_PERMISSION_MODES[1],
  { id: "claude-auto", risk: "elevated", runtimeMode: "auto" },
  ESTABLISHED_PERMISSION_MODES[2],
] as const satisfies readonly ClaudePermissionModeCandidate[];

const discoveryCache = new Map<string, Promise<DiscoveredAgentCapabilities>>();

async function runClaudeCliCommand(executablePath: string, args: string[]) {
  const { stdout } = await execFileAsync(executablePath, args, {
    encoding: "utf8",
    timeout: 2_000,
    windowsHide: true,
  });

  return { stdout };
}

function toPermissionModeOption(
  candidate: ClaudePermissionModeCandidate,
): AgentPermissionModeOption {
  return { id: candidate.id, risk: candidate.risk };
}

async function probeClaudeCliCapabilities(
  executablePath: string,
  version: string | undefined,
  runClaude: RunClaudeCliCommand,
): Promise<DiscoveredAgentCapabilities> {
  const supported = await Promise.all(
    PERMISSION_MODE_CANDIDATES.map<
      Promise<ClaudePermissionModeCandidate | null>
    >(async (candidate) => {
      try {
        await runClaude(executablePath, [
          "--permission-mode",
          candidate.runtimeMode,
          "--version",
        ]);
        return candidate;
      } catch {
        return null;
      }
    }),
  );
  const permissionModes = supported
    .filter(
      (candidate): candidate is ClaudePermissionModeCandidate =>
        candidate !== null,
    )
    .map(toPermissionModeOption);

  return {
    capabilities: {
      permissionModes:
        permissionModes.length > 0
          ? permissionModes
          : ESTABLISHED_PERMISSION_MODES.map(toPermissionModeOption),
    },
    ...(version ? { version } : {}),
  };
}

export async function discoverClaudeCliCapabilities(
  executablePath: string,
  runClaude: RunClaudeCliCommand = runClaudeCliCommand,
): Promise<DiscoveredAgentCapabilities> {
  let version: string | undefined;
  try {
    const result = await runClaude(executablePath, ["--version"]);
    version = result.stdout.trim() || undefined;
  } catch {
    return probeClaudeCliCapabilities(executablePath, undefined, runClaude);
  }

  if (runClaude !== runClaudeCliCommand || !version) {
    return probeClaudeCliCapabilities(executablePath, version, runClaude);
  }

  const cacheKey = `${executablePath}\0${version}`;
  let discovery = discoveryCache.get(cacheKey);
  if (!discovery) {
    discovery = probeClaudeCliCapabilities(executablePath, version, runClaude);
    discoveryCache.set(cacheKey, discovery);
  }
  return discovery;
}
