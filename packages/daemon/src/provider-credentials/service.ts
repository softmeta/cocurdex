import { randomUUID } from "node:crypto";
import {
  registerBundledPiProviderOAuthFlows,
  resolvePiProviderAuth,
} from "@cocurdex/agent-adapters/provider-auth";
import type {
  AgentProviderSnapshot,
  AgentRuntimeProviderConfig,
  SessionRecord,
} from "@cocurdex/shared";
import type { DaemonState } from "../state";
import { type CredentialVault, createCredentialVault } from "./vault";

export class ProviderCredentials {
  private readonly vault: CredentialVault;

  constructor(
    private readonly state: Pick<
      DaemonState,
      "getProviderConfig" | "setProviderApiKeySecretId"
    >,
    private readonly userDataPath: string,
    vault?: CredentialVault,
  ) {
    this.vault = vault ?? createCredentialVault(userDataPath);
    registerBundledPiProviderOAuthFlows();
  }

  async setApiKey(providerId: string, apiKey: string | null) {
    if (typeof providerId !== "string" || !providerId.trim())
      throw new Error("Invalid provider ID");
    if (
      apiKey !== null &&
      (typeof apiKey !== "string" || !apiKey.trim() || apiKey.length > 64_000)
    )
      throw new Error("Invalid API key");
    const provider = await this.state.getProviderConfig(providerId);
    if (!provider) throw new Error("Provider not found");
    if (apiKey === null) {
      if (provider.apiKeySecretId)
        await this.vault.remove(provider.apiKeySecretId);
      await this.state.setProviderApiKeySecretId(providerId, null);
      return;
    }
    const secretId = provider.apiKeySecretId ?? randomUUID();
    await this.vault.write(secretId, apiKey);
    if (!provider.apiKeySecretId) {
      try {
        await this.state.setProviderApiKeySecretId(providerId, secretId);
      } catch (error) {
        await this.vault.remove(secretId);
        throw error;
      }
    }
  }

  async readApiKey(providerId: string) {
    const provider = await this.state.getProviderConfig(providerId);
    if (!provider) return null;
    const auth = await resolvePiProviderAuth(this.userDataPath, provider.id);
    if (auth?.auth.apiKey) return auth.auth.apiKey;
    return provider.apiKeySecretId
      ? this.vault.read(provider.apiKeySecretId)
      : null;
  }

  async forSession(
    session: SessionRecord,
  ): Promise<AgentRuntimeProviderConfig | null> {
    if (session.agentType === "codex" || !session.providerSnapshot) return null;
    return this.resolveSnapshot(session.providerSnapshot);
  }

  async resolveSnapshot(
    snapshot: AgentProviderSnapshot,
  ): Promise<AgentRuntimeProviderConfig> {
    const provider = await this.state.getProviderConfig(snapshot.providerId);
    const auth = provider
      ? await resolvePiProviderAuth(this.userDataPath, provider.id)
      : undefined;
    const apiKey =
      auth?.auth.apiKey ??
      (provider?.apiKeySecretId
        ? await this.vault.read(provider.apiKeySecretId)
        : null);
    if (provider?.apiKeySecretId && !apiKey)
      throw new Error(
        "Provider API key is missing; set it again in provider settings",
      );
    let headersJson = snapshot.headersJson;
    if (auth?.auth.headers) {
      const headers = headersJson ? (JSON.parse(headersJson) as unknown) : {};
      if (!headers || typeof headers !== "object" || Array.isArray(headers))
        throw new Error("Provider headers must be an object");
      headersJson = JSON.stringify({ ...headers, ...auth.auth.headers });
    }
    return {
      ...snapshot,
      apiKey,
      baseUrl: auth?.auth.baseUrl ?? snapshot.baseUrl,
      modelBaseUrl: auth?.auth.baseUrl ?? snapshot.modelBaseUrl,
      headersJson,
    };
  }
}
