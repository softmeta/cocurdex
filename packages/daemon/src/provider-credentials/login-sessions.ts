import { randomUUID } from "node:crypto";
import type { loginPiProvider } from "@cocurdex/agent-adapters/provider-auth";
import type {
  ProviderAuthLoginUpdate,
  ProviderAuthMethod,
  ProviderAuthPrompt,
} from "@cocurdex/shared";

type LoginInteraction = Parameters<typeof loginPiProvider>[3];
type PiAuthPrompt = Parameters<LoginInteraction["prompt"]>[0];

export type ProviderLogin = (
  providerId: string,
  method: ProviderAuthMethod,
  interaction: LoginInteraction,
) => Promise<void>;

interface PendingLogin {
  controller: AbortController;
  prompts: Map<
    string,
    { resolve(value: string): void; reject(error: Error): void }
  >;
  queue: ProviderAuthLoginUpdate[];
  waiters: Array<(update: ProviderAuthLoginUpdate) => void>;
}

const LOGIN_RETENTION_MS = 5 * 60 * 1000;

function isTerminal(update: ProviderAuthLoginUpdate) {
  return update.type === "complete" || update.type === "error";
}

function normalizePrompt(
  promptId: string,
  prompt: PiAuthPrompt,
): ProviderAuthPrompt {
  if (prompt.type === "select") {
    return {
      id: promptId,
      type: "select",
      message: prompt.message,
      options: prompt.options.map((option) => ({
        id: option.id,
        label: option.label,
        description: option.description ?? null,
      })),
    };
  }
  return {
    id: promptId,
    type: prompt.type,
    message: prompt.message,
    placeholder: prompt.placeholder ?? null,
  };
}

export class ProviderLoginSessions {
  private readonly logins = new Map<string, PendingLogin>();

  constructor(
    private readonly login: ProviderLogin,
    private readonly onComplete: (providerId: string) => Promise<void>,
  ) {}

  start(providerId: string, method: ProviderAuthMethod) {
    const loginId = randomUUID();
    const pending: PendingLogin = {
      controller: new AbortController(),
      prompts: new Map(),
      queue: [],
      waiters: [],
    };
    this.logins.set(loginId, pending);

    this.login(providerId, method, {
      signal: pending.controller.signal,
      prompt: (prompt) => this.prompt(pending, prompt),
      notify: (event) => this.push(pending, toLoginUpdate(event)),
    })
      .then(async () => {
        await this.onComplete(providerId);
        this.finish(loginId, pending, { type: "complete" });
      })
      .catch((error: unknown) => {
        this.finish(loginId, pending, {
          type: "error",
          error:
            error instanceof Error ? error.message : "Provider login failed",
        });
      });

    return { loginId };
  }

  async next(loginId: string): Promise<ProviderAuthLoginUpdate> {
    const pending = this.logins.get(loginId);
    if (!pending) {
      return { type: "error", error: "Unknown login attempt" };
    }
    const update =
      pending.queue.shift() ??
      (await new Promise<ProviderAuthLoginUpdate>((resolve) => {
        pending.waiters.push(resolve);
      }));
    if (isTerminal(update) && this.logins.get(loginId) === pending) {
      this.logins.delete(loginId);
    }
    return update;
  }

  respond(loginId: string, promptId: string, value: string) {
    const prompt = this.logins.get(loginId)?.prompts.get(promptId);
    if (!prompt) {
      throw new Error("Login prompt is no longer active");
    }
    this.logins.get(loginId)?.prompts.delete(promptId);
    prompt.resolve(value);
  }

  cancel(loginId: string) {
    const pending = this.logins.get(loginId);
    if (!pending) {
      return;
    }
    pending.controller.abort();
    for (const prompt of pending.prompts.values()) {
      prompt.reject(new Error("Login cancelled"));
    }
    pending.prompts.clear();
    this.push(pending, { type: "error", error: "Login cancelled" });
    this.logins.delete(loginId);
  }

  private prompt(pending: PendingLogin, prompt: PiAuthPrompt) {
    const promptId = randomUUID();
    return new Promise<string>((resolve, reject) => {
      const abortSignal = prompt.signal ?? pending.controller.signal;
      const rejectPrompt = () => {
        pending.prompts.delete(promptId);
        reject(new Error("Login cancelled"));
        this.push(pending, { type: "prompt_cancelled", promptId });
      };
      if (prompt.signal?.aborted || pending.controller.signal.aborted) {
        rejectPrompt();
        return;
      }
      abortSignal.addEventListener("abort", rejectPrompt, { once: true });
      pending.prompts.set(promptId, {
        resolve: (value) => {
          abortSignal.removeEventListener("abort", rejectPrompt);
          resolve(value);
        },
        reject,
      });
      this.push(pending, {
        type: "prompt",
        prompt: normalizePrompt(promptId, prompt),
      });
    });
  }

  private push(pending: PendingLogin, update: ProviderAuthLoginUpdate) {
    const waiter = pending.waiters.shift();
    if (waiter) {
      waiter(update);
      return;
    }
    pending.queue.push(update);
  }

  private finish(
    loginId: string,
    pending: PendingLogin,
    update: ProviderAuthLoginUpdate,
  ) {
    this.push(pending, update);
    const cleanup = setTimeout(() => {
      if (this.logins.get(loginId) === pending) {
        this.logins.delete(loginId);
      }
    }, LOGIN_RETENTION_MS);
    cleanup.unref();
  }
}

function toLoginUpdate(
  event: Parameters<LoginInteraction["notify"]>[0],
): ProviderAuthLoginUpdate {
  if (event.type === "info" || event.type === "progress") {
    return { type: event.type, message: event.message };
  }
  if (event.type === "auth_url") {
    return {
      type: "auth_url",
      url: event.url,
      instructions: event.instructions ?? null,
    };
  }
  return {
    type: "device_code",
    userCode: event.userCode,
    verificationUri: event.verificationUri,
  };
}
