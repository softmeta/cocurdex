import type {
  CodexAccountState,
  CodexLoginOutcome,
  CodexLoginStartResult,
} from "@cocurdex/shared";
import { isRecord } from "./codex-app-server-events";
import {
  acquireCodexClient,
  type CodexClientLease,
} from "./codex-app-server-pool";

// Codex owns the whole ChatGPT OAuth flow: account/login/start returns an
// authUrl, the app-server hosts the localhost callback, and tokens persist in
// ~/.codex. This module only drives the RPCs and relays the outcome.

interface ActiveLogin {
  lease: CodexClientLease;
  unsubscribe(): void;
  timeout: NodeJS.Timeout;
  onCompleted(outcome: CodexLoginOutcome): void;
}

const activeLogins = new Map<string, ActiveLogin>();

// ponytail: 10 min covers a human browser roundtrip; abandoned logins get
// cancelled so the pooled app-server process is not held open forever.
const loginTimeoutMs = 10 * 60 * 1000;

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function parseAccountState(result: unknown): CodexAccountState {
  const account =
    isRecord(result) && isRecord(result.account) ? result.account : null;
  const requiresOpenaiAuth =
    isRecord(result) && result.requiresOpenaiAuth === true;

  if (!account) {
    return { method: null, email: null, planType: null, requiresOpenaiAuth };
  }

  if (account.type === "chatgpt") {
    return {
      method: "chatgpt",
      email: getString(account.email),
      planType: getString(account.planType),
      requiresOpenaiAuth,
    };
  }

  return {
    method: account.type === "apiKey" ? "apikey" : "other",
    email: null,
    planType: null,
    requiresOpenaiAuth,
  };
}

export async function readCodexAccount(): Promise<CodexAccountState> {
  const lease = acquireCodexClient();

  try {
    const result = await lease.client.request("account/read", {
      refreshToken: false,
    });
    return parseAccountState(result);
  } finally {
    lease.release();
  }
}

function finishLogin(loginId: string, outcome: CodexLoginOutcome) {
  const login = activeLogins.get(loginId);

  if (!login) {
    return;
  }

  activeLogins.delete(loginId);
  clearTimeout(login.timeout);
  login.unsubscribe();
  login.lease.release();
  login.onCompleted(outcome);
}

export async function startCodexChatGptLogin(
  onCompleted: (outcome: CodexLoginOutcome) => void,
): Promise<CodexLoginStartResult> {
  const lease = acquireCodexClient();

  try {
    const result = await lease.client.request("account/login/start", {
      type: "chatgpt",
    });
    const loginId = isRecord(result) ? getString(result.loginId) : null;
    const authUrl = isRecord(result) ? getString(result.authUrl) : null;

    if (!loginId || !authUrl) {
      throw new Error("Codex app-server returned an invalid login response");
    }

    const unsubscribe = lease.onGlobalNotification((notification) => {
      if (
        notification.method !== "account/login/completed" ||
        !isRecord(notification.params) ||
        notification.params.loginId !== loginId
      ) {
        return;
      }

      finishLogin(loginId, {
        success: notification.params.success === true,
        error: getString(notification.params.error),
      });
    });

    const timeout = setTimeout(() => {
      void lease.client
        .request("account/login/cancel", { loginId })
        .catch(() => {});
      finishLogin(loginId, { success: false, error: "Login timed out" });
    }, loginTimeoutMs);

    activeLogins.set(loginId, { lease, unsubscribe, timeout, onCompleted });
    return { loginId, authUrl };
  } catch (error) {
    lease.release();
    throw error;
  }
}

export async function cancelCodexLogin(loginId: string): Promise<void> {
  const login = activeLogins.get(loginId);

  if (login) {
    await login.lease.client
      .request("account/login/cancel", { loginId })
      .catch(() => {});
    finishLogin(loginId, { success: false, error: null });
    return;
  }

  const lease = acquireCodexClient();

  try {
    await lease.client.request("account/login/cancel", { loginId });
  } finally {
    lease.release();
  }
}

export async function logoutCodex(): Promise<void> {
  const lease = acquireCodexClient();

  try {
    await lease.client.request("account/logout", {});
  } finally {
    lease.release();
  }
}
