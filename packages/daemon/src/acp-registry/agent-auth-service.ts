import {
  cancelAcpRegistryProviderLogin,
  loginAcpRegistryProvider,
  logoutAcpRegistryProvider,
  readAcpRegistryProviderAuth,
} from "@cocurdex/agent-adapters";
import {
  type AcpRegistryAgentId,
  type AgentAuthState,
  type AgentId,
  isAcpRegistryAgentId,
} from "@cocurdex/shared";
import type { AcpRegistryService } from "./acp-registry-service";

export interface AgentAuthProvider {
  login(agentId: AcpRegistryAgentId, methodId?: string): Promise<void>;
  cancelLogin(agentId: AcpRegistryAgentId): boolean;
  logout(agentId: AcpRegistryAgentId): Promise<void>;
  read(
    agentId: AcpRegistryAgentId,
  ): Promise<Omit<AgentAuthState, "preferredMethodId" | "liveSessionCount">>;
}

export const acpRegistryAuthProvider: AgentAuthProvider = {
  login: loginAcpRegistryProvider,
  cancelLogin: cancelAcpRegistryProviderLogin,
  logout: logoutAcpRegistryProvider,
  read: readAcpRegistryProviderAuth,
};

export interface AgentAuthServiceOptions {
  registry: Pick<AcpRegistryService, "listInstalled" | "setAuthMethod">;
  liveSessionIds(agentId: AgentId): string[];
  disposeSession(sessionId: string): Promise<void>;
  provider?: AgentAuthProvider;
}

export class AgentAuthService {
  private readonly provider: AgentAuthProvider;

  constructor(private readonly options: AgentAuthServiceOptions) {
    this.provider = options.provider ?? acpRegistryAuthProvider;
  }

  async login(params: { agentId: AgentId; methodId?: string }) {
    const { agentId, methodId } = params;
    if (!isAcpRegistryAgentId(agentId)) {
      throw new Error(`Agent ${agentId} does not support login`);
    }
    const switching =
      methodId !== undefined && methodId !== this.preferredMethodId(agentId);
    if (switching) {
      await this.stopLiveSessions(agentId);
    }
    await this.provider.login(agentId, methodId);
    if (switching) {
      await this.options.registry.setAuthMethod(agentId, methodId);
    }
    return null;
  }

  cancelLogin(agentId: AgentId) {
    if (isAcpRegistryAgentId(agentId)) {
      this.provider.cancelLogin(agentId);
    }
    return null;
  }

  async logout(agentId: AcpRegistryAgentId) {
    await this.stopLiveSessions(agentId);
    await this.provider.logout(agentId);
    return null;
  }

  async read(agentId: AcpRegistryAgentId): Promise<AgentAuthState> {
    const auth = await this.provider.read(agentId);
    return {
      ...auth,
      preferredMethodId: this.preferredMethodId(agentId),
      liveSessionCount: this.options.liveSessionIds(agentId).length,
    };
  }

  private preferredMethodId(agentId: AcpRegistryAgentId) {
    return (
      this.options.registry
        .listInstalled()
        .find((agent) => agent.agentId === agentId)?.authMethodId ?? null
    );
  }

  private async stopLiveSessions(agentId: AcpRegistryAgentId) {
    await Promise.all(
      this.options
        .liveSessionIds(agentId)
        .map((sessionId) => this.options.disposeSession(sessionId)),
    );
  }
}
