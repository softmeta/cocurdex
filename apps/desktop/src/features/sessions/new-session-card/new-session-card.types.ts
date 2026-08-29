import type {
  AgentDescriptor,
  AgentId,
  AgentPermissionMode,
  AgentProviderSnapshot,
  AgentThinkingLevel,
  CollaborationModeKind,
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
  sessionTitle?: string;
  agentType?: AgentId;
  collaborationMode?: CollaborationModeKind;
  attachment?: MessageAttachment;
  composerRef?: Ref<ChatComposerHandle>;
  workspaceRootPath?: string | null;
  onClearAttachment?(): void;
  onSelectWorkspace?(workspaceId: string): void;
  onOpenWorkspace?(): void;
  onSelectBranch?(branch: string): Promise<void> | void;
  onSelectAgent?(agentType: AgentId): void;
  onSelectCollaborationMode?(mode: CollaborationModeKind): void;
  onStartSession?: (payload: {
    agentType: AgentId;
    collaborationMode: CollaborationModeKind;
    permissionMode?: AgentPermissionMode | null;
    message: string;
    attachments?: MessageAttachment[];
    providerSnapshot?: AgentProviderSnapshot | null;
    thinkingLevel?: AgentThinkingLevel;
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
  | "onSelectBranch"
>;
