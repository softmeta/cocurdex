import { randomUUID } from "node:crypto";
import {
  type PiMcpLocation,
  type PiMcpSignIn,
  startPiMcpSignIn,
} from "@cocurdex/agent-adapters/pi-mcp";
import type { McpLoginOutcome, McpLoginStartResult } from "@cocurdex/shared";

const MCP_LOGIN_TIMEOUT_MS = 5 * 60_000;

export class McpLoginSessions {
  private readonly signIns = new Map<string, PiMcpSignIn>();

  async start(
    location: PiMcpLocation,
    name: string,
  ): Promise<McpLoginStartResult> {
    const signIn = startPiMcpSignIn(location, name, MCP_LOGIN_TIMEOUT_MS);
    const authUrl = await signIn.authUrl;
    if (authUrl === null) {
      await signIn.done;
      return { loginId: null, authUrl: null };
    }
    const loginId = randomUUID();
    this.signIns.set(loginId, signIn);
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

  cancel(loginId: string) {
    this.signIns.get(loginId)?.cancel();
  }

  cancelAll() {
    for (const signIn of this.signIns.values()) signIn.cancel();
  }
}
