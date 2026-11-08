import {
  type AgentInstallationDetectorOptions,
  detectAgentInstallations,
  lookupExecutable,
  readExecutableVersion,
} from "@cocurdex/agent-core";
import type { AgentDescriptor } from "@cocurdex/shared";

const PROBE_WINDOW_MS = 5_000;

function shareProbes(probe: (key: string) => Promise<string | null>) {
  const pending = new Map<string, Promise<string | null>>();
  return (key: string) => {
    const existing = pending.get(key);
    if (existing) {
      return existing;
    }
    const result = probe(key).catch((error: unknown) => {
      pending.delete(key);
      throw error;
    });
    pending.set(key, result);
    return result;
  };
}

export function createAgentInstallationProbes(
  {
    lookupCommand = lookupExecutable,
    readVersion = readExecutableVersion,
  }: AgentInstallationDetectorOptions = {},
  now = () => performance.now(),
) {
  let window: {
    expiresAt: number;
    path: string | undefined;
    pathExt: string | undefined;
    options: AgentInstallationDetectorOptions;
  } | null = null;

  return {
    detect(descriptors: AgentDescriptor[]) {
      const time = now();
      const { PATH: path, PATHEXT: pathExt } = process.env;
      if (
        !window ||
        time >= window.expiresAt ||
        path !== window.path ||
        pathExt !== window.pathExt
      ) {
        window = {
          expiresAt: time + PROBE_WINDOW_MS,
          path,
          pathExt,
          options: {
            lookupCommand: shareProbes(lookupCommand),
            readVersion: shareProbes(readVersion),
          },
        };
      }
      return detectAgentInstallations(descriptors, window.options);
    },
    invalidate() {
      window = null;
    },
  };
}
