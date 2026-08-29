import type { ProviderModelRecord } from "@cocurdex/shared";

export interface ProviderModelRepository {
  list(providerId?: string): Promise<ProviderModelRecord[]>;
  get(providerId: string, modelId: string): Promise<ProviderModelRecord | null>;
  upsert(model: ProviderModelRecord): Promise<void>;
  delete(providerId: string, modelId: string): Promise<void>;
  deleteByProvider(providerId: string): Promise<void>;
}
