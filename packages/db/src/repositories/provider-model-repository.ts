import type { ProviderModelRecord } from "@cocurdex/shared";

export interface ProviderModelOverrideRow {
  providerId: string;
  modelId: string;
  overrideJson: string;
  updatedAt: string;
}

export interface ProviderModelRepository {
  list(providerId?: string): Promise<ProviderModelRecord[]>;
  get(providerId: string, modelId: string): Promise<ProviderModelRecord | null>;
  upsert(model: ProviderModelRecord): Promise<void>;
  delete(providerId: string, modelId: string): Promise<void>;
  deleteByProvider(providerId: string): Promise<void>;
  listOverrides(providerId?: string): Promise<ProviderModelOverrideRow[]>;
  upsertOverride(row: ProviderModelOverrideRow): Promise<void>;
  deleteOverride(providerId: string, modelId: string): Promise<void>;
}
