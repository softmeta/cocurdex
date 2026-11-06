import { randomUUID } from "node:crypto";
import {
  type PiMcpLocation,
  type PiMcpSignIn,
  startPiMcpSignIn,
} from "@cocurdex/agent-adapters/pi-mcp";
import type {
  McpLoginOutcome,
  McpLoginStartResult,
  McpServerConfig,
} from "@cocurdex/shared";

const MCP_LOGIN_TIMEOUT_MS = 5 * 60_000;

export class McpLoginSessions {
  private readonly signIns = new Map<string, PiMcpSignIn>();
  private readonly pending = new Map<PiMcpSignIn, string>();

  async start(
    location: PiMcpLocation,
    name: string,
    expectedConfig?: McpServerConfig,
  ): Promise<McpLoginStartResult> {
    if (this.signIns.size >= 32)
      throw new Error(
        "Too many pending sign-ins. Cancel an existing attempt or wait for it to expire.",
      );
    const signIn = startPiMcpSignIn(
      location,
      name,
      MCP_LOGIN_TIMEOUT_MS,
      expectedConfig,
    );
    this.pending.set(signIn, name);
    void signIn.done.then(
      () => this.pending.delete(signIn),
      () => this.pending.delete(signIn),
    );
    const authUrl = await signIn.authUrl;
    if (authUrl === null) {
      await signIn.done;
      return { loginId: null, authUrl: null };
    }
    const loginId = randomUUID();
    this.signIns.set(loginId, signIn);
    const expire = () => {
      const timer = setTimeout(
        () => this.signIns.delete(loginId),
        MCP_LOGIN_TIMEOUT_MS,
      );
      timer.unref();
    };
    void signIn.done.then(expire, expire);
    return { loginId, authUrl };
  }

  async wait(loginId: string): Promise<McpLoginOutcome> {
    const signIn = this.signIns.get(loginId);
    if (!signIn) {
      return { success: false, error: "Unknown login attempt" };
    }
    try {
      await signIn.done;
      return { success: true, error: null };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      this.signIns.delete(loginId);
    }
  }

  submitRedirectUrl(loginId: string, url: string) {
    const signIn = this.signIns.get(loginId);
    if (!signIn) throw new Error("Unknown login attempt");
    signIn.submitRedirectUrl(url);
  }

  cancel(loginId: string) {
    this.signIns.get(loginId)?.cancel();
    this.signIns.delete(loginId);
  }

  async cancelServer(name: string) {
    const matching = [...this.pending]
      .filter(([, server]) => server === name)
      .map(([signIn]) => signIn);
    for (const signIn of matching) signIn.cancel();
    await Promise.allSettled(matching.map((signIn) => signIn.done));
  }

  cancelAll() {
    for (const signIn of this.pending.keys()) signIn.cancel();
    this.signIns.clear();
  }
}
