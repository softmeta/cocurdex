// Generic key/value store for app-level preferences. Values are opaque JSON
// strings; callers own the encoding and typing for each key.
export interface AppSettingsRepository {
  get(key: string): Promise<string | null>;
  set(key: string, valueJson: string): Promise<void>;
}
