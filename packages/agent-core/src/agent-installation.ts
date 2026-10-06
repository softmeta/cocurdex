import { access, constants } from "node:fs/promises";
import path from "node:path";
import { type AgentDescriptor, parseAgentVersion } from "@cocurdex/shared";
import { getAgentRuntimeOwnership } from "./agent-registry";
import { runCommand } from "./run-command";

const DEFAULT_WINDOWS_PATHEXT = ".COM;.EXE;.BAT;.CMD";

export type AgentCommandLookup = (command: string) => Promise<string | null>;
export type AgentVersionReader = (
  executablePath: string,
) => Promise<string | null>;

export interface AgentInstallationDetectorOptions {
  lookupCommand?: AgentCommandLookup;
  readVersion?: AgentVersionReader;
}

function cloneDescriptor(descriptor: AgentDescriptor): AgentDescriptor {
  return {
    ...descriptor,
    capabilities: {
      ...descriptor.capabilities,
      sessionModes: descriptor.capabilities.sessionModes.map((mode) => ({
        ...mode,
      })),
      permissionModes: descriptor.capabilities.permissionModes.map((mode) => ({
        ...mode,
      })),
      writeModes: [...descriptor.capabilities.writeModes],
    },
    installation: descriptor.installation
      ? { ...descriptor.installation }
      : descriptor.installation,
  };
}

function createLookupArgs(command: string, platform: NodeJS.Platform) {
  return platform === "win32"
    ? { executable: "where.exe", args: [command] }
    : { executable: "which", args: [command] };
}

function selectLookupResult(
  stdout: string,
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): string | null {
  const candidates = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (platform !== "win32") {
    return candidates[0] ?? null;
  }
  const executableExtensions = new Set(
    (env.PATHEXT || DEFAULT_WINDOWS_PATHEXT)
      .split(";")
      .map((extension) => extension.trim().toLowerCase())
      .filter(Boolean),
  );
  return (
    candidates.find((candidate) =>
      executableExtensions.has(path.win32.extname(candidate).toLowerCase()),
    ) ?? null
  );
}

export interface LookupExecutableOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  run?: (
    command: string,
    args: readonly string[],
  ) => Promise<{ stdout: string }>;
}

export async function lookupExecutable(
  command: string,
  options: LookupExecutableOptions = {},
): Promise<string | null> {
  if (path.isAbsolute(command)) {
    return access(command, constants.X_OK).then(
      () => command,
      () => null,
    );
  }
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const run = options.run ?? runCommand;
  const lookup = createLookupArgs(command, platform);

  try {
    const { stdout } = await run(lookup.executable, lookup.args);
    return selectLookupResult(stdout, platform, env);
  } catch {
    return null;
  }
}

/** Every supported CLI answers `--version`; the shapes differ, the flag does not. */
export async function readExecutableVersion(
  executablePath: string,
): Promise<string | null> {
  try {
    const { stdout } = await runCommand(executablePath, ["--version"], {
      timeoutMs: 5_000,
    });

    return parseAgentVersion(stdout);
  } catch {
    return null;
  }
}

export async function detectAgentInstallations(
  descriptors: AgentDescriptor[],
  options: AgentInstallationDetectorOptions = {},
): Promise<AgentDescriptor[]> {
  const lookupCommand = options.lookupCommand ?? lookupExecutable;
  const readVersion = options.readVersion ?? readExecutableVersion;

  return Promise.all(
    descriptors.map(async (descriptor) => {
      const runtime = getAgentRuntimeOwnership(descriptor.id);
      const nextDescriptor = cloneDescriptor(descriptor);

      if (runtime.kind === "builtin") {
        return {
          ...nextDescriptor,
          availability: nextDescriptor.availability,
          installation: null,
        };
      }

      const { executableName, version: knownVersion } = runtime;

      try {
        const executablePath = await lookupCommand(executableName);

        return {
          ...nextDescriptor,
          availability: executablePath ? "available" : "missing",
          installation: {
            executableName,
            executablePath,
            version:
              executablePath && !knownVersion
                ? await readVersion(executablePath)
                : (knownVersion ?? null),
          },
        };
      } catch (error) {
        return {
          ...nextDescriptor,
          availability: "error",
          installation: {
            executableName,
            executablePath: null,
            error: error instanceof Error ? error.message : String(error),
          },
        };
      }
    }),
  );
}
