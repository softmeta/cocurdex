import type {
  AgentDescriptor,
  AgentId,
  AgentPermissionDecision,
  AgentPlanApprovalDecision,
  AgentProviderSelection,
  AgentRuntimeProviderConfig,
  AgentSessionConfigOption,
  AgentSlashCommand,
  AppBootstrapData,
  CocurdexDaemonEvent,
  CompatibleProviderModel,
  CreateColumnPayload,
  CreateIssuePayload,
  CreateNotePayload,
  CreateSessionPayload,
  CreateViewPayload,
  CreateWorkflowPayload,
  DeleteColumnPayload,
  DeleteIssuePayload,
  DeleteNotePayload,
  DeleteViewPayload,
  GetIssuePayload,
  GetNotePayload,
  IssueRecord,
  LoadViewPayload,
  MessageRecord,
  MoveColumnPayload,
  MoveIssuePayload,
  MoveNotePayload,
  NetworkProxyTestResult,
  NoteBacklinksPayload,
  NoteLink,
  NoteRecord,
  NoteSummary,
  NoteTag,
  ProviderConfigRecord,
  ProviderListModelsResult,
  SearchDocumentResult,
  SearchDocumentsPayload,
  SendSessionMessagePayload,
  SessionAttentionSnapshot,
  SessionObservationSnapshot,
  SessionRecord,
  TurnChangeFileContent,
  TurnChangeFileContentRequest,
  UndoTurnChangesInput,
  UndoTurnChangesResult,
  UpdateColumnPayload,
  UpdateIssuePayload,
  UpdateNotePayload,
  UpdateSessionAttentionPayload,
  UpdateSessionTitlePayload,
  UpdateViewPayload,
  ViewColumnRecord,
  ViewFull,
  ViewSummary,
  WorkflowAggregate,
  WorkflowGateDecisionRecord,
  WorkflowRunRecord,
  WorkspaceRecord,
} from "@cocurdex/shared";

export const DAEMON_PROTOCOL_VERSION = 10;

export interface DaemonMetadata {
  pid: number;
  protocolVersion: number;
  runtimeFingerprint: string;
  socketPath: string;
  token: string;
  startedAt: string;
}

export interface DaemonStatus {
  pid: number;
  protocolVersion: number;
  runtimeFingerprint: string;
  socketPath: string;
  startedAt: string;
}

export interface DaemonError {
  code: string;
  message: string;
}

export type DaemonRequestPayloadByMethod = {
  "daemon.status": undefined;
  "app.bootstrap": undefined;
  "agent.list": undefined;
  "workspace.list": undefined;
  "workspace.save": { workspace: WorkspaceRecord };
  "session.list": undefined;
  "session.snapshot": { sessionId: string };
  "session.create": CreateSessionPayload;
  "session.delete": { sessionId: string };
  "session.updateTitle": UpdateSessionTitlePayload;
  "session.generateTitle": { sessionId: string; message: string };
  "session.listSlashCommands": {
    agentType: AgentId;
    workspaceRootPath: string;
  };
  "session.rewind": { message: MessageRecord };
  "session.send": {
    message: SendSessionMessagePayload;
    providerConfig: AgentRuntimeProviderConfig | null;
  };
  "session.resumeQueued": {
    sessionId: string;
    providerConfig: AgentRuntimeProviderConfig | null;
  };
  "session.updateQueued": {
    sessionId: string;
    messageId: string;
    content: string;
  };
  "session.deleteQueued": { sessionId: string; messageId: string };
  "session.steerQueued": { sessionId: string; messageId: string };
  "session.setConfig": {
    sessionId: string;
    configId: string;
    value: boolean | string;
  };
  "session.setMode": { sessionId: string; modeId: string };
  "session.stop": { sessionId: string };
  "session.undoTurnChanges": UndoTurnChangesInput;
  "session.getTurnChangeFile": TurnChangeFileContentRequest;
  "daemon.subscribe": undefined;
  "network.proxy.test": undefined;
  "attention.list": undefined;
  "attention.update": UpdateSessionAttentionPayload;
  "storage.call": { operation: string; args: unknown[] };
  "note.list": undefined;
  "note.get": GetNotePayload;
  "note.create": CreateNotePayload;
  "note.update": UpdateNotePayload;
  "note.move": MoveNotePayload;
  "note.delete": DeleteNotePayload;
  "note.listTags": { noteId?: string };
  "note.backlinks": NoteBacklinksPayload;
  "issue.listViews": undefined;
  "issue.loadView": LoadViewPayload;
  "issue.createView": CreateViewPayload;
  "issue.updateView": UpdateViewPayload;
  "issue.deleteView": DeleteViewPayload;
  "issue.createColumn": CreateColumnPayload;
  "issue.updateColumn": UpdateColumnPayload;
  "issue.moveColumn": MoveColumnPayload;
  "issue.deleteColumn": DeleteColumnPayload;
  "issue.get": GetIssuePayload;
  "issue.create": CreateIssuePayload;
  "issue.update": UpdateIssuePayload;
  "issue.move": MoveIssuePayload;
  "issue.delete": DeleteIssuePayload;
  "search.documents": SearchDocumentsPayload;
  "workflow.list": undefined;
  "workflow.get": { workflowRunId: string };
  "workflow.create": CreateWorkflowPayload;
  "workflow.start": { workflowRunId: string };
  "workflow.decideGate": {
    workflowRunId: string;
    stepId: string;
    decision: WorkflowGateDecisionRecord["decision"];
    actor?: WorkflowGateDecisionRecord["actor"];
    reason?: string;
  };
  "workflow.cancel": { workflowRunId: string };
  "permission.resolve": {
    requestId: string;
    decision: AgentPermissionDecision;
  };
  "question.resolve": { questionId: string; answer: string };
  "planApproval.resolve": {
    approvalId: string;
    decision: AgentPlanApprovalDecision;
  };
  "provider.listConfigs": undefined;
  "provider.listModels": { providerId?: string };
  "provider.listCompatibleForAgent": { agentId: AgentId };
  "provider.listDefaults": undefined;
};

export type DaemonResultByMethod = {
  "daemon.status": DaemonStatus;
  "app.bootstrap": AppBootstrapData;
  "agent.list": AgentDescriptor[];
  "workspace.list": WorkspaceRecord[];
  "workspace.save": WorkspaceRecord;
  "session.list": SessionRecord[];
  "session.snapshot": SessionObservationSnapshot | null;
  "session.create": SessionRecord;
  "session.delete": null;
  "session.updateTitle": SessionRecord | null;
  "session.generateTitle": string | null;
  "session.listSlashCommands": AgentSlashCommand[];
  "session.rewind": null;
  "session.send": MessageRecord;
  "session.resumeQueued": boolean;
  "session.updateQueued": MessageRecord;
  "session.deleteQueued": null;
  "session.steerQueued": MessageRecord;
  "session.setConfig": AgentSessionConfigOption[];
  "session.setMode": null;
  "session.stop": null;
  "session.undoTurnChanges": UndoTurnChangesResult;
  "session.getTurnChangeFile": TurnChangeFileContent;
  "daemon.subscribe": null;
  "network.proxy.test": NetworkProxyTestResult;
  "attention.list": SessionAttentionSnapshot[];
  "attention.update": SessionAttentionSnapshot;
  "storage.call": unknown;
  "note.list": NoteSummary[];
  "note.get": NoteRecord | null;
  "note.create": NoteRecord;
  "note.update": NoteRecord;
  "note.move": NoteRecord;
  "note.delete": null;
  "note.listTags": NoteTag[];
  "note.backlinks": NoteLink[];
  "issue.listViews": ViewSummary[];
  "issue.loadView": ViewFull | null;
  "issue.createView": ViewSummary;
  "issue.updateView": ViewFull;
  "issue.deleteView": null;
  "issue.createColumn": ViewColumnRecord;
  "issue.updateColumn": ViewColumnRecord;
  "issue.moveColumn": ViewColumnRecord;
  "issue.deleteColumn": null;
  "issue.get": IssueRecord;
  "issue.create": IssueRecord;
  "issue.update": IssueRecord;
  "issue.move": IssueRecord;
  "issue.delete": null;
  "search.documents": SearchDocumentResult[];
  "workflow.list": WorkflowRunRecord[];
  "workflow.get": WorkflowAggregate | null;
  "workflow.create": WorkflowAggregate;
  "workflow.start": WorkflowAggregate;
  "workflow.decideGate": WorkflowAggregate;
  "workflow.cancel": WorkflowAggregate;
  "permission.resolve": boolean;
  "question.resolve": boolean;
  "planApproval.resolve": boolean;
  "provider.listConfigs": ProviderConfigRecord[];
  "provider.listModels": ProviderListModelsResult;
  "provider.listCompatibleForAgent": CompatibleProviderModel[];
  "provider.listDefaults": AgentProviderSelection[];
};

export type DaemonMethod = keyof DaemonRequestPayloadByMethod;

type DaemonNoParamMethod = {
  [M in DaemonMethod]: DaemonRequestPayloadByMethod[M] extends undefined
    ? M
    : never;
}[DaemonMethod];

/**
 * Runtime catalog of methods whose payload is `undefined`. Must stay in lockstep
 * with `DaemonRequestPayloadByMethod`: missing or extra keys fail typecheck.
 * The client uses this to tell `{ userDataPath }` options apart from params.
 */
export const DAEMON_NO_PARAM_METHODS = {
  "agent.list": true,
  "app.bootstrap": true,
  "attention.list": true,
  "daemon.status": true,
  "daemon.subscribe": true,
  "issue.listViews": true,
  "network.proxy.test": true,
  "note.list": true,
  "provider.listConfigs": true,
  "provider.listDefaults": true,
  "session.list": true,
  "workflow.list": true,
  "workspace.list": true,
} as const satisfies Record<DaemonNoParamMethod, true>;

export function daemonMethodHasNoParams(
  method: DaemonMethod,
): method is DaemonNoParamMethod {
  return Object.hasOwn(DAEMON_NO_PARAM_METHODS, method);
}

export type DaemonRequest<M extends DaemonMethod = DaemonMethod> = {
  [Method in DaemonMethod]: DaemonRequestPayloadByMethod[Method] extends undefined
    ? { id: string; method: Method; token: string }
    : {
        id: string;
        method: Method;
        params: DaemonRequestPayloadByMethod[Method];
        token: string;
      };
}[M];

export type DaemonResponse<M extends DaemonMethod = DaemonMethod> = {
  [Method in DaemonMethod]:
    | { id: string; result: DaemonResultByMethod[Method] }
    | { error: DaemonError; id: string };
}[M];

export interface DaemonEventEnvelope {
  event: CocurdexDaemonEvent;
  type: "daemon.event";
}

export type DaemonWireMessage =
  | DaemonRequest
  | DaemonResponse
  | DaemonEventEnvelope;
