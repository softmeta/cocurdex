import type { EditorViewRecord } from "@cocurdex/shared";

export interface EditorViewRepository {
  getBySessionId(sessionId: string): Promise<EditorViewRecord | null>;
  list(): Promise<EditorViewRecord[]>;
  upsert(view: EditorViewRecord): Promise<void>;
}
