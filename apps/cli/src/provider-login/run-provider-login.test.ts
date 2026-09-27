import type { ProviderAuthLoginUpdate } from "@cocurdex/shared";
import { describe, expect, it, vi } from "vitest";
import {
  type ProviderLoginClient,
  type ProviderLoginUi,
  runProviderLogin,
} from "./run-provider-login";

function createClient(updates: ProviderAuthLoginUpdate[]) {
  const pending = [...updates];
  const client: ProviderLoginClient = {
    start: vi.fn(async () => ({ loginId: "login-1" })),
    next: vi.fn(async () => {
      const update = pending.shift();
      if (!update) throw new Error("no more updates");
      return update;
    }),
    respond: vi.fn(async () => {}),
    cancel: vi.fn(async () => {}),
  };
  return client;
}

function createUi(answer = "code-123") {
  const controller = new AbortController();
  const ui: ProviderLoginUi & { controller: AbortController } = {
    controller,
    signal: controller.signal,
    showAuthUrl: vi.fn(),
    showDeviceCode: vi.fn(),
    showMessage: vi.fn(),
    prompt: vi.fn(async () => answer),
    dismissPrompt: vi.fn(),
  };
  return ui;
}

describe("runProviderLogin", () => {
  it("renders login steps, answers prompts, and resolves on completion", async () => {
    const client = createClient([
      { type: "auth_url", url: "https://auth.test", instructions: null },
      {
        type: "prompt",
        prompt: {
          id: "p1",
          type: "manual_code",
          message: "Paste code",
          placeholder: null,
        },
      },
      { type: "progress", message: "Exchanging token" },
      { type: "complete" },
    ]);
    const ui = createUi();

    await runProviderLogin(client, ui, "anthropic", "oauth");

    expect(client.start).toHaveBeenCalledWith("anthropic", "oauth");
    expect(ui.showAuthUrl).toHaveBeenCalledWith("https://auth.test", null);
    expect(ui.showMessage).toHaveBeenCalledWith("Exchanging token");
    expect(client.respond).toHaveBeenCalledWith("login-1", "p1", "code-123");
    expect(client.cancel).not.toHaveBeenCalled();
  });

  it("surfaces daemon login errors", async () => {
    const client = createClient([{ type: "error", error: "denied" }]);

    await expect(
      runProviderLogin(client, createUi(), "anthropic", "oauth"),
    ).rejects.toThrow("denied");
  });

  it("keeps the login alive when the daemon dismisses a prompt", async () => {
    const client = createClient([
      {
        type: "prompt",
        prompt: {
          id: "p1",
          type: "manual_code",
          message: "Paste code",
          placeholder: null,
        },
      },
      { type: "prompt_cancelled", promptId: "p1" },
      { type: "complete" },
    ]);
    const ui = createUi();
    vi.mocked(ui.prompt).mockRejectedValue(new Error("dismissed"));

    await runProviderLogin(client, ui, "anthropic", "oauth");

    expect(ui.dismissPrompt).toHaveBeenCalledWith("p1");
    expect(client.cancel).not.toHaveBeenCalled();
  });

  it("cancels the daemon login when the user aborts", async () => {
    let releaseNext: (update: ProviderAuthLoginUpdate) => void = () => {};
    const client = createClient([]);
    vi.mocked(client.next).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseNext = resolve;
        }),
    );
    vi.mocked(client.cancel).mockImplementation(async () => {
      releaseNext({ type: "error", error: "Login cancelled" });
    });
    const ui = createUi();

    const login = runProviderLogin(client, ui, "anthropic", "oauth");
    await vi.waitFor(() => expect(client.next).toHaveBeenCalled());
    ui.controller.abort();

    await expect(login).rejects.toThrow("Login cancelled");
    expect(client.cancel).toHaveBeenCalledWith("login-1");
  });
});
