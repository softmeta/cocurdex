export interface AppSettingsRepository {
  get(key: string): Promise<string | null>;
  set(key: string, valueJson: string): Promise<void>;
}
