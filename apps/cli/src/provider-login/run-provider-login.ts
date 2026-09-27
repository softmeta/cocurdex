import type {
  ProviderAuthLoginUpdate,
  ProviderAuthMethod,
  ProviderAuthPrompt,
} from "@cocurdex/shared";

export interface ProviderLoginClient {
  start(
    providerId: string,
    method: ProviderAuthMethod,
  ): Promise<{ loginId: string }>;
  next(loginId: string): Promise<ProviderAuthLoginUpdate>;
  respond(loginId: string, promptId: string, value: string): Promise<void>;
  cancel(loginId: string): Promise<void>;
}

export interface ProviderLoginUi {
  readonly signal: AbortSignal;
  showAuthUrl(url: string, instructions: string | null): void;
  showDeviceCode(userCode: string, verificationUri: string): void;
  showMessage(message: string): void;
  prompt(prompt: ProviderAuthPrompt): Promise<string>;
  dismissPrompt(promptId: string): void;
}

export function resolveSelectAnswer(
  prompt: Extract<ProviderAuthPrompt, { type: "select" }>,
  answer: string,
) {
  const option =
    prompt.options[Number(answer) - 1] ??
    prompt.options.find((candidate) => candidate.id === answer);
  if (!option) throw new Error(`Unknown option: ${answer}`);
  return option.id;
}

export class ProviderLoginCancelled extends Error {
  constructor() {
    super("Login cancelled");
  }
}

export async function runProviderLogin(
  client: ProviderLoginClient,
  ui: ProviderLoginUi,
  providerId: string,
  method: ProviderAuthMethod,
) {
  const { loginId } = await client.start(providerId, method);
  const cancel = () => {
    void client.cancel(loginId).catch(() => {});
  };
  ui.signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      if (ui.signal.aborted) throw new ProviderLoginCancelled();
      const update = await client.next(loginId);
      if (ui.signal.aborted) throw new ProviderLoginCancelled();
      switch (update.type) {
        case "complete":
          return;
        case "error":
          throw new Error(update.error);
        case "auth_url":
          ui.showAuthUrl(update.url, update.instructions);
          break;
        case "device_code":
          ui.showDeviceCode(update.userCode, update.verificationUri);
          break;
        case "info":
        case "progress":
          ui.showMessage(update.message);
          break;
        case "prompt_cancelled":
          ui.dismissPrompt(update.promptId);
          break;
        case "prompt":
          void answerPrompt(client, ui, loginId, update.prompt);
          break;
      }
    }
  } finally {
    ui.signal.removeEventListener("abort", cancel);
  }
}

async function answerPrompt(
  client: ProviderLoginClient,
  ui: ProviderLoginUi,
  loginId: string,
  prompt: ProviderAuthPrompt,
) {
  let value: string;
  try {
    value = await ui.prompt(prompt);
  } catch {
    return;
  }
  await client.respond(loginId, prompt.id, value).catch(() => {});
}
