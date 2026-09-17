import type {
  AgentDescriptor,
  AgentId,
  AgentPermissionMode,
  AgentProviderSnapshot,
  AgentThinkingLevel,
  GitWorktreeInfo,
  MessageAttachment,
  WorkspaceRecord,
} from "@cocurdex/shared";
import type { Ref } from "react";
import type { ChatComposerHandle } from "@/features/composer";
import type { GitBranchInfo } from "@/lib";

export interface NewSessionCardProps {
  workspaceName?: string;
  agents?: AgentDescriptor[];
  activeWorkspaceId?: string | null;
  workspaces?: WorkspaceRecord[];
  activeBranches?: GitBranchInfo[];
  activeBranch?: string | null;
  worktrees?: GitWorktreeInfo[];
  selectedWorktreePath?: string | null;
  sessionTitle?: string;
  agentType?: AgentId;
  sessionModeId?: string | null;
  attachment?: MessageAttachment;
  composerRef?: Ref<ChatComposerHandle>;
  workspaceRootPath?: string | null;
  onClearAttachment?(): void;
  onSelectWorkspace?(workspaceId: string): void;
  onOpenWorkspace?(): void;
  onRelocateWorkspace?(workspaceId: string): void;
  onSelectBranch?(branch: string): Promise<void> | void;
  onSelectWorktree?(path: string | null): void;
  onSelectAgent?(agentType: AgentId): void;
  onSelectSessionMode?(modeId: string): void;
  onStartSession?: (payload: {
    agentType: AgentId;
    sessionModeId: string | null;
    permissionMode?: AgentPermissionMode | null;
    message: string;
    attachments?: MessageAttachment[];
    providerSnapshot?: AgentProviderSnapshot | null;
    thinkingLevel?: AgentThinkingLevel;
    agentRoleId?: string | null;
  }) => void;
}

// Hook props are the component props minus render-only fields.
export type UseNewSessionCardProps = Omit<
  NewSessionCardProps,
  | "activeBranch"
  | "activeBranches"
  | "composerRef"
  | "sessionTitle"
  | "onSelectWorkspace"
  | "onOpenWorkspace"
  | "onRelocateWorkspace"
  | "onSelectBranch"
  | "onSelectWorktree"
  | "selectedWorktreePath"
  | "worktrees"
>;
