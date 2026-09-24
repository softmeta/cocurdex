import type { PendingSettingsChangeRecord } from "@cocurdex/shared";

export interface PendingSettingsChangeRepository {
  list(): Promise<PendingSettingsChangeRecord[]>;
  add(change: PendingSettingsChangeRecord): Promise<void>;
  delete(id: string): Promise<void>;
}
