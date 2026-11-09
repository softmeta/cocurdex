import {
  type AgentInstallationDetectorOptions,
  detectAgentInstallations,
  lookupExecutable,
  readExecutableVersion,
} from "@cocurdex/agent-core";
import type { AgentDescriptor } from "@cocurdex/shared";
import {
  applyNodeGlobalProxy,
  applyShellEnvAsync,
  readShellStartupSignature,
} from "@cocurdex/shared/node";

const PROBE_WINDOW_MS = 5_000;

export interface AgentInstallationProbesOptions
  extends AgentInstallationDetectorOptions {
  refreshShellEnv?: (options?: { force?: boolean }) => Promise<boolean>;
}

export interface ProcessShellEnvRefresherOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  readSignature?: () => Promise<string>;
  applyEnv?: () => Promise<{ resolved: boolean; changed: boolean }>;
}

export function createProcessShellEnvRefresher(
  options: ProcessShellEnvRefresherOptions = {},
) {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const readSignature = options.readSignature ?? readShellStartupSignature;
  const applyEnv =
    options.applyEnv ?? (() => applyShellEnvAsync({ platform, env }));
  let lastStartupSignature: string | null = null;
  let pending: Promise<boolean> | null = null;

  return (refreshOptions: { force?: boolean } = {}): Promise<boolean> => {
    if (platform === "win32") {
      return Promise.resolve(false);
    }
    if (pending) {
      return pending;
    }
    pending = (async () => {
      const signature = await readSignature();
      if (
        !refreshOptions.force &&
        lastStartupSignature !== null &&
        signature === lastStartupSignature
      ) {
        return false;
      }
      const { resolved, changed } = await applyEnv();
      if (resolved) {
        lastStartupSignature = signature;
        if (changed && env === process.env) {
          applyNodeGlobalProxy(process.env);
        }
      }
      return changed;
    })().finally(() => {
      pending = null;
    });
    return pending;
  };
}

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
    refreshShellEnv,
  }: AgentInstallationProbesOptions = {},
  now = () => performance.now(),
) {
  const refreshEnv =
    refreshShellEnv ??
    (lookupCommand === lookupExecutable
      ? createProcessShellEnvRefresher()
      : async () => false);
  let forceEnvRefresh = false;
  let window: {
    expiresAt: number;
    path: string | undefined;
    pathExt: string | undefined;
    eagerRefresh: Promise<boolean> | null;
    refreshOnce: (force?: boolean) => Promise<boolean>;
    options: AgentInstallationDetectorOptions;
  } | null = null;

  return {
    async detect(descriptors: AgentDescriptor[]) {
      const time = now();
      const { PATH: path, PATHEXT: pathExt } = process.env;
      if (
        !window ||
        time >= window.expiresAt ||
        path !== window.path ||
        pathExt !== window.pathExt
      ) {
        const shouldForceRefresh = forceEnvRefresh;
        forceEnvRefresh = false;
        let refreshPromise: Promise<boolean> | null = null;
        const currentWindow = {
          expiresAt: time + PROBE_WINDOW_MS,
          path,
          pathExt,
          eagerRefresh: null as Promise<boolean> | null,
          refreshOnce(force = false) {
            refreshPromise ??= refreshEnv({ force }).then((changed) => {
              if (changed) {
                currentWindow.path = process.env.PATH;
                currentWindow.pathExt = process.env.PATHEXT;
              }
              return changed;
            });
            return refreshPromise;
          },
          options: {} as AgentInstallationDetectorOptions,
        };
        currentWindow.options = {
          lookupCommand: shareProbes(async (command) => {
            const found = await lookupCommand(command);
            if (found !== null) {
              return found;
            }
            if (await currentWindow.refreshOnce()) {
              return lookupCommand(command);
            }
            return null;
          }),
          readVersion: shareProbes(readVersion),
        };
        if (shouldForceRefresh) {
          currentWindow.eagerRefresh = currentWindow.refreshOnce(true);
        }
        window = currentWindow;
      }
      if (window.eagerRefresh) {
        await window.eagerRefresh;
      }
      return detectAgentInstallations(descriptors, window.options);
    },
    invalidate() {
      forceEnvRefresh = true;
      window = null;
    },
  };
}
