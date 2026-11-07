import { homedir } from "node:os";
import {
  buildChildProcessEnv,
  killProcessTree,
  spawnCommand,
} from "@cocurdex/agent-adapters";

export const GITHUB_CLIENT_ID = "Ov23liI4ixzGGvD0emDA";
export const GITHUB_SCOPES = "repo read:org notifications";

const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";
const SLOW_DOWN_SECONDS = 5;
const GH_TIMEOUT_MS = 5000;

export interface GitHubDeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  intervalSeconds: number;
  expiresInSeconds: number;
}

export interface GitHubToken {
  accessToken: string;
  scope?: string;
}

export interface GitHubLoginClient {
  cliToken(): Promise<string | null>;
  deviceCode(signal: AbortSignal): Promise<GitHubDeviceCode>;
  pollToken(code: GitHubDeviceCode, signal: AbortSignal): Promise<GitHubToken>;
}

type Fetch = typeof fetch;
type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

function postForm(
  fetchImpl: Fetch,
  url: string,
  body: Record<string, string>,
  signal: AbortSignal,
) {
  return fetchImpl(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body),
    signal,
  });
}

function stringField(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "string" && field ? field : null;
}

function numberField(value: Record<string, unknown>, key: string) {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : null;
}

async function readJson(response: Response) {
  const value: unknown = await response.json();
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error("GitHub returned an unexpected response");
  return value as Record<string, unknown>;
}

const DEVICE_ERRORS: Record<string, string> = {
  expired_token: "The GitHub code expired. Connect again to get a new one.",
  access_denied: "GitHub authorization was declined.",
  device_flow_disabled: "Device authorization is disabled for this GitHub app.",
};

export async function requestGitHubDeviceCode(
  fetchImpl: Fetch,
  signal: AbortSignal,
): Promise<GitHubDeviceCode> {
  const response = await postForm(
    fetchImpl,
    DEVICE_CODE_URL,
    { client_id: GITHUB_CLIENT_ID, scope: GITHUB_SCOPES },
    signal,
  );
  const body = await readJson(response);
  const deviceCode = stringField(body, "device_code");
  const userCode = stringField(body, "user_code");
  const verificationUri = stringField(body, "verification_uri");
  if (!response.ok || !deviceCode || !userCode || !verificationUri)
    throw new Error(
      stringField(body, "error_description") ??
        `GitHub did not start authorization (${response.status})`,
    );
  return {
    deviceCode,
    userCode,
    verificationUri,
    intervalSeconds: numberField(body, "interval") ?? SLOW_DOWN_SECONDS,
    expiresInSeconds: numberField(body, "expires_in") ?? 900,
  };
}

export async function pollGitHubDeviceToken(
  code: GitHubDeviceCode,
  fetchImpl: Fetch,
  sleep: Sleep,
  signal: AbortSignal,
  now: () => number = Date.now,
): Promise<GitHubToken> {
  const deadline = now() + code.expiresInSeconds * 1000;
  let intervalSeconds = code.intervalSeconds;
  while (now() < deadline) {
    await sleep(intervalSeconds * 1000, signal);
    const body = await readJson(
      await postForm(
        fetchImpl,
        ACCESS_TOKEN_URL,
        {
          client_id: GITHUB_CLIENT_ID,
          device_code: code.deviceCode,
          grant_type: DEVICE_GRANT,
        },
        signal,
      ),
    );
    const accessToken = stringField(body, "access_token");
    if (accessToken) {
      const scope = stringField(body, "scope");
      return scope ? { accessToken, scope } : { accessToken };
    }
    const error = stringField(body, "error");
    if (error === "authorization_pending") continue;
    if (error === "slow_down") {
      intervalSeconds =
        numberField(body, "interval") ?? intervalSeconds + SLOW_DOWN_SECONDS;
      continue;
    }
    throw new Error(
      (error && DEVICE_ERRORS[error]) ??
        stringField(body, "error_description") ??
        "GitHub authorization failed",
    );
  }
  throw new Error(DEVICE_ERRORS.expired_token);
}

export function abortableSleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new Error("GitHub authorization was cancelled"));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", aborted);
      resolve();
    }, ms);
    const aborted = () => {
      clearTimeout(timer);
      reject(new Error("GitHub authorization was cancelled"));
    };
    signal.addEventListener("abort", aborted, { once: true });
  });
}

export function readGhCliToken(): Promise<string | null> {
  return new Promise((resolve) => {
    const stdout: Buffer[] = [];
    const child = spawnCommand(
      "gh",
      ["auth", "token", "--hostname", "github.com"],
      {
        cwd: homedir(),
        env: buildChildProcessEnv(process.env, {
          extraAllowedNames: ["GH_CONFIG_DIR", "XDG_CONFIG_HOME"],
        }),
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const timer = setTimeout(() => {
      if (child.pid !== undefined)
        void killProcessTree(child.pid).catch(() => undefined);
      resolve(null);
    }, GH_TIMEOUT_MS);
    timer.unref();
    child.stdout?.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.once("error", () => {
      clearTimeout(timer);
      resolve(null);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      const token = Buffer.concat(stdout).toString("utf8").trim();
      resolve(code === 0 && token ? token : null);
    });
  });
}

export function createGitHubLoginClient(
  fetchImpl: Fetch = fetch,
): GitHubLoginClient {
  return {
    cliToken: readGhCliToken,
    deviceCode: (signal) => requestGitHubDeviceCode(fetchImpl, signal),
    pollToken: (code, signal) =>
      pollGitHubDeviceToken(code, fetchImpl, abortableSleep, signal),
  };
}
