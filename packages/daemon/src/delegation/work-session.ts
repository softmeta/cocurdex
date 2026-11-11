import type {
  AgentInputDelivery,
  CreateSessionPayload,
  MessageRecord,
  SendSessionCommand,
  SessionRecord,
} from "@cocurdex/shared";
import { branchSlug } from "./work-targets";

export interface WorkSessionDependencies {
  createSession(input: CreateSessionPayload): Promise<SessionRecord>;
  saveSession(session: SessionRecord): Promise<void>;
  createWorktree(input: {
    workspaceId: string;
    branch: string;
  }): Promise<{ path: string }>;
  sendSessionMessage(command: SendSessionCommand): Promise<MessageRecord>;
  hasActiveRun(sessionId: string): boolean;
  supportsSteering(session: SessionRecord): Promise<boolean>;
}

export async function createWorkSession(
  deps: WorkSessionDependencies,
  input: {
    workspaceId: string;
    agentRoleId: string | null;
    title: string;
    isolateWorktree: boolean;
  },
) {
  const created = await deps.createSession({
    workspaceId: input.workspaceId,
    agentRoleId: input.agentRoleId,
    title: input.title,
  });
  if (!input.isolateWorktree) return created;
  const { path } = await deps.createWorktree({
    workspaceId: created.workspaceId,
    branch: `assistant/${branchSlug(input.title)}-${created.id.slice(0, 6)}`,
  });
  const isolated = { ...created, worktreePath: path };
  await deps.saveSession(isolated);
  return isolated;
}

export async function followUpDelivery(
  deps: Pick<WorkSessionDependencies, "hasActiveRun" | "supportsSteering">,
  session: SessionRecord,
): Promise<AgentInputDelivery> {
  if (!deps.hasActiveRun(session.id)) return "start-new-run";
  return (await deps.supportsSteering(session))
    ? "steer-active-run"
    : "queue-after-run";
}
