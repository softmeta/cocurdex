import type { DatabaseSync } from "node:sqlite";
import {
  createSqliteAgentProviderDefaultRepository,
  createSqliteProviderConfigRepository,
  createSqliteProviderModelRepository,
  createSqliteProviderSecretRepository,
} from "./repositories";

export function createProviderRepositories(database: DatabaseSync) {
  return {
    agentProviderDefaults: createSqliteAgentProviderDefaultRepository(database),
    providerConfigs: createSqliteProviderConfigRepository(database),
    providerModels: createSqliteProviderModelRepository(database),
    providerSecrets: createSqliteProviderSecretRepository(database),
  };
}
