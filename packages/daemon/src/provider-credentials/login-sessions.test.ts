import { describe, expect, it, vi } from "vitest";
import { type ProviderLogin, ProviderLoginSessions } from "./login-sessions";

describe("ProviderLoginSessions", () => {
  it("relays auth events and prompts, then completes", async () => {
    const onComplete = vi.fn(async () => {});
    const login: ProviderLogin = async (_providerId, _method, interaction) => {
      interaction.notify({
        type: "auth_url",
        url: "https://example.test/auth",
      });
      const code = await interaction.prompt({
        type: "manual_code",
        message: "Paste code",
      });
      expect(code).toBe("abc");
    };
    const sessions = new ProviderLoginSessions(login, onComplete);
    const { loginId } = sessions.start("anthropic", "oauth");

    expect(await sessions.next(loginId)).toEqual({
      type: "auth_url",
      url: "https://example.test/auth",
      instructions: null,
    });
    const prompt = await sessions.next(loginId);
    if (prompt.type !== "prompt") throw new Error("expected prompt");
    expect(prompt.prompt).toMatchObject({
      type: "manual_code",
      message: "Paste code",
    });

    sessions.respond(loginId, prompt.prompt.id, "abc");

    expect(await sessions.next(loginId)).toEqual({ type: "complete" });
    expect(onComplete).toHaveBeenCalledWith("anthropic");
    expect(await sessions.next(loginId)).toEqual({
      type: "error",
      error: "Unknown login attempt",
    });
  });

  it("reports login failures without running completion", async () => {
    const onComplete = vi.fn(async () => {});
    const sessions = new ProviderLoginSessions(async () => {
      throw new Error("denied");
    }, onComplete);
    const { loginId } = sessions.start("anthropic", "oauth");

    expect(await sessions.next(loginId)).toEqual({
      type: "error",
      error: "denied",
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("cancels a pending prompt and aborts the login", async () => {
    let signal: AbortSignal | undefined;
    const sessions = new ProviderLoginSessions(
      async (_providerId, _method, interaction) => {
        signal = interaction.signal;
        await interaction.prompt({ type: "text", message: "Name" });
      },
      async () => {},
    );
    const { loginId } = sessions.start("anthropic", "api_key");
    const prompt = await sessions.next(loginId);
    if (prompt.type !== "prompt") throw new Error("expected prompt");
    const waiting = sessions.next(loginId);

    sessions.cancel(loginId);

    expect(signal?.aborted).toBe(true);
    expect(await waiting).toEqual({
      type: "prompt_cancelled",
      promptId: prompt.prompt.id,
    });
    expect(() => sessions.respond(loginId, prompt.prompt.id, "x")).toThrow(
      "Login prompt is no longer active",
    );
  });
});
