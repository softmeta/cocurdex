import type { ProviderConfigRecord } from "@cocurdex/shared";

export interface ProviderConfigRepository {
  list(): Promise<ProviderConfigRecord[]>;
  getById(id: string): Promise<ProviderConfigRecord | null>;
  upsert(config: ProviderConfigRecord): Promise<void>;
  delete(id: string): Promise<void>;
  setApiKeySecretId(id: string, secretId: string | null): Promise<void>;
}
