import { randomBytes } from "node:crypto";

export class AgentToolTokenRegistry {
  private readonly tokenBySession = new Map<string, string>();
  private readonly sessionByToken = new Map<string, string>();

  issue(sessionId: string) {
    this.revoke(sessionId);
    const token = randomBytes(24).toString("hex");
    this.tokenBySession.set(sessionId, token);
    this.sessionByToken.set(token, sessionId);
    return token;
  }

  resolve(token: string) {
    return this.sessionByToken.get(token) ?? null;
  }

  revoke(sessionId: string) {
    const token = this.tokenBySession.get(sessionId);
    if (token === undefined) return;
    this.tokenBySession.delete(sessionId);
    this.sessionByToken.delete(token);
  }
}
