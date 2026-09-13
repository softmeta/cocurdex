import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// Shared spawn contract for `grok agent stdio`, used by both the session
// adapter and the model-catalog probe so they always talk to the same process
// shape (and the same startup hints).
export const GROK_BUILD_COMMAND = "grok";

export const GROK_BUILD_PROBE_TIMEOUT_MS = 20_000;

export async function withGrokBuildProbeCwd<T>(
  run: (cwd: string) => Promise<T>,
): Promise<T> {
  const cwd = await mkdtemp(path.join(tmpdir(), "cocurdex-grok-probe-"));
  try {
    return await run(cwd);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

export async function withGrokBuildProbeTimeout<T>(
  run: () => Promise<T>,
  timeoutMs = GROK_BUILD_PROBE_TIMEOUT_MS,
): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const work = run().then(
    (value) => (timedOut ? null : value),
    (error: unknown) => {
      if (timedOut) {
        return null;
      }
      throw error;
    },
  );
  try {
    return await Promise.race([
      work,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => {
          timedOut = true;
          resolve(null);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export const GROK_BUILD_ARGS = ["--no-auto-update", "agent", "stdio"];

export const GROK_BUILD_INITIALIZE_META = {
  clientType: "cocurdex",
  startupHints: {
    nonInteractive: true,
    skipGitStatus: true,
    skipProjectLayout: true,
  },
};

export function getGrokBuildAuthMethodPriority(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env.XAI_API_KEY
    ? ["xai.api_key", "cached_token"]
    : ["cached_token", "xai.api_key"];
}
