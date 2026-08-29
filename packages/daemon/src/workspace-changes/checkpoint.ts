import type {
  HostCheckpointKind,
  TurnFileChange,
  UndoFileResult,
} from "@cocurdex/shared";

export type { HostCheckpointKind };

export interface HostCheckpoint {
  id: string;
  kind: HostCheckpointKind;
  ref: string;
  workspaceRootPath: string;
}

export interface CaptureCheckpointInput {
  workspaceRootPath: string;
  sessionId: string;
  userMessageId: string;
  phase: "before" | "after" | "recovery" | `recovery-${string}`;
}

export interface RestorePathPlan {
  path: string;
  previousPath?: string | null;
  operation: TurnFileChange["operation"];
  expectedAfterHash?: string | null;
  restoreFromHash?: string | null;
}

export type RestorePathResult = UndoFileResult;

export interface HostCheckpointAdapter {
  kind: HostCheckpointKind;
  capture(input: CaptureCheckpointInput): Promise<HostCheckpoint>;
  diff(
    before: HostCheckpoint,
    after: HostCheckpoint,
  ): Promise<TurnFileChange[]>;
  readFile(
    checkpoint: HostCheckpoint,
    relativePath: string,
  ): Promise<Buffer | null>;
  restorePaths(input: {
    workspaceRootPath: string;
    checkpoint: HostCheckpoint;
    paths: RestorePathPlan[];
  }): Promise<RestorePathResult[]>;
  hashWorkingTreeFile(
    workspaceRootPath: string,
    relativePath: string,
  ): Promise<string | null>;
  referencedBlobHashes?(refs: string[]): Promise<Set<string>>;
  listCheckpoints?(input?: { workspaceRootPath?: string }): Promise<
    Array<{
      ref: string;
      sessionId?: string;
      createdAt?: string;
      phase?: string;
      workspaceRootPath?: string;
    }>
  >;
  cleanup(input: {
    refs: string[];
    workspaceRootPath?: string;
    sessionId?: string;
    pruneUnreferenced?: boolean;
  }): Promise<void>;
}
