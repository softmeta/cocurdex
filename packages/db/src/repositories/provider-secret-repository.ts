export interface ProviderSecretRecord {
  id: string;
  encryptedValue: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderSecretRepository {
  getById(id: string): Promise<ProviderSecretRecord | null>;
  upsert(secret: ProviderSecretRecord): Promise<void>;
  delete(id: string): Promise<void>;
}
