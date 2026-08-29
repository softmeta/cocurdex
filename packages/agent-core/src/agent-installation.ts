import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { type AgentDescriptor, parseAgentVersion } from "@cocurdex/shared";
import { getAgentRuntimeOwnership } from "./agent-registry";

const execFileAsync = promisify(execFile);

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
      collaborationModes: [...descriptor.capabilities.collaborationModes],
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

function createLookupArgs(command: string) {
  return process.platform === "win32"
    ? { executable: "where.exe", args: [command] }
    : { executable: "which", args: [command] };
}

export async function lookupExecutable(
  command: string,
): Promise<string | null> {
  const lookup = createLookupArgs(command);

  try {
    const { stdout } = await execFileAsync(lookup.executable, lookup.args, {
      windowsHide: true,
    });
    const executablePath = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    return executablePath ?? null;
  } catch {
    return null;
  }
}

/** Every supported CLI answers `--version`; the shapes differ, the flag does not. */
export async function readExecutableVersion(
  executablePath: string,
): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(executablePath, ["--version"], {
      encoding: "utf8",
      timeout: 5_000,
      windowsHide: true,
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

      const { executableName } = runtime;

      try {
        const executablePath = await lookupCommand(executableName);

        return {
          ...nextDescriptor,
          availability: executablePath ? "available" : "missing",
          installation: {
            executableName,
            executablePath,
            version: executablePath ? await readVersion(executablePath) : null,
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
