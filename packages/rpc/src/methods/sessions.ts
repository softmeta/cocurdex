import type {
  AgentId,
  AgentPlanApprovalDecision,
  AgentSessionConfigOption,
  AgentSessionRuntimeState,
  AgentSlashCommand,
  AgentToolCallRecord,
  AgentToolCallResult,
  ArchiveSessionsResult,
  ContextTransferRecord,
  CreateSessionPayload,
  ForkSessionPayload,
  GetToolCallResultInput,
  MessageRecord,
  NewSessionDefaults,
  PeerInboundPolicy,
  PeerSessionSummary,
  RefineSessionTitlePayload,
  SendPeerMessagePayload,
  SendPeerMessageResult,
  SendSessionCommand,
  SessionAttentionSnapshot,
  SessionConfiguration,
  SessionExecutionTree,
  SessionIdsPayload,
  SessionMessagesResult,
  SessionObservationSnapshot,
  SessionRecord,
  SessionTranscriptPage,
  SetSessionPinnedPayload,
  TurnChangeDiff,
  TurnChangeDiffRequest,
  TurnChangeFileContent,
  TurnChangeFileContentRequest,
  TurnChangeSet,
  UndoTurnChangesInput,
  UndoTurnChangesResult,
  UpdateSessionAttentionPayload,
  UpdateSessionRuntimePayload,
  UpdateSessionTitlePayload,
} from "@cocurdex/shared";

export type SessionsRequests = {
  "assistant.session.create": { workspaceId: string };
  "assistant.session.getOrCreate": { workspaceId: string };
  "session.list": undefined;
  "session.snapshot": { sessionId: string };
  "session.transcriptPage": {
    sessionId: string;
    beforeSeq: number | null;
  };
  "session.executionTree": { sessionId: string; maxDepth?: number };
  "session.fork": ForkSessionPayload;
  "session.switchAgent": { sessionId: string; agentType: AgentId };
  "session.contextTransfers": { sessionId: string };
  "session.configure": SessionConfiguration;
  "session.create": CreateSessionPayload;
  "session.resolveNew": CreateSessionPayload;
  "session.get": { sessionId: string };
  "session.lastMessage": { sessionId: string };
  "session.runtimeState": { sessionId: string };
  "session.listPeers": { sessionId: string };
  "session.sendPeerMessage": SendPeerMessagePayload;
  "session.setPeerInbound": { sessionId: string; policy: PeerInboundPolicy };
  "session.delete": { sessionId: string };
  "session.archive": { sessionId: string };
  "session.restore": { sessionId: string };
  "session.archiveMany": SessionIdsPayload;
  "session.restoreMany": SessionIdsPayload;
  "session.listArchived": undefined;
  "session.updateTitle": UpdateSessionTitlePayload;
  "session.setPinned": SetSessionPinnedPayload;
  "session.refineTitle": RefineSessionTitlePayload;
  "session.listMessages": { sessionId: string };
  "session.listToolCalls": { sessionId: string };
  "session.listSlashCommands": {
    agentType: AgentId;
    workspaceRootPath: string;
  };
  "session.send": SendSessionCommand;
  "session.resumeQueued": { sessionId: string };
  "session.updateQueued": {
    sessionId: string;
    messageId: string;
    content: string;
  };
  "session.deleteQueued": { sessionId: string; messageId: string };
  "session.steerQueued": { sessionId: string; messageId: string };
  "session.sendQueuedNow": { sessionId: string; messageId: string };
  "session.setConfig": {
    sessionId: string;
    configId: string;
    value: boolean | string;
  };
  "session.setMode": { sessionId: string; modeId: string };
  "session.updateRuntime": UpdateSessionRuntimePayload;
  "session.stop": { sessionId: string };
  "session.undoTurnChanges": UndoTurnChangesInput;
  "session.getTurnChangeFile": TurnChangeFileContentRequest;
  "session.listTurnChangeSets": { sessionId: string };
  "session.getTurnChangeDiff": TurnChangeDiffRequest;
  "session.getToolCallResult": GetToolCallResultInput;
  "attention.list": undefined;
  "attention.update": UpdateSessionAttentionPayload;
  "permission.resolve": {
    requestId: string;
    optionId: string;
  };
  "question.resolve": { questionId: string; answer: string };
  "planApproval.resolve": {
    approvalId: string;
    decision: AgentPlanApprovalDecision;
  };
};

export type SessionsResults = {
  "assistant.session.create": SessionRecord;
  "assistant.session.getOrCreate": SessionRecord;
  "session.list": SessionRecord[];
  "session.snapshot": SessionObservationSnapshot | null;
  "session.transcriptPage": SessionTranscriptPage;
  "session.executionTree": SessionExecutionTree | null;
  "session.fork": SessionRecord;
  "session.switchAgent": SessionRecord;
  "session.contextTransfers": ContextTransferRecord[];
  "session.configure": SessionRecord;
  "session.create": SessionRecord;
  "session.resolveNew": NewSessionDefaults;
  "session.get": SessionRecord | null;
  "session.lastMessage": MessageRecord | null;
  "session.runtimeState": AgentSessionRuntimeState;
  "session.listPeers": PeerSessionSummary[];
  "session.sendPeerMessage": SendPeerMessageResult;
  "session.setPeerInbound": SessionRecord;
  "session.delete": null;
  "session.archive": SessionRecord | null;
  "session.restore": SessionRecord[];
  "session.archiveMany": ArchiveSessionsResult;
  "session.restoreMany": SessionRecord[];
  "session.listArchived": SessionRecord[];
  "session.updateTitle": SessionRecord | null;
  "session.setPinned": SessionRecord | null;
  "session.refineTitle": SessionRecord | null;
  "session.listMessages": SessionMessagesResult;
  "session.listToolCalls": AgentToolCallRecord[];
  "session.listSlashCommands": AgentSlashCommand[];
  "session.send": MessageRecord;
  "session.resumeQueued": boolean;
  "session.updateQueued": MessageRecord;
  "session.deleteQueued": null;
  "session.steerQueued": MessageRecord;
  "session.sendQueuedNow": MessageRecord;
  "session.setConfig": AgentSessionConfigOption[];
  "session.setMode": null;
  "session.updateRuntime": SessionRecord;
  "session.stop": null;
  "session.undoTurnChanges": UndoTurnChangesResult;
  "session.getTurnChangeFile": TurnChangeFileContent;
  "session.listTurnChangeSets": TurnChangeSet[];
  "session.getTurnChangeDiff": TurnChangeDiff;
  "session.getToolCallResult": AgentToolCallResult | null;
  "attention.list": SessionAttentionSnapshot[];
  "attention.update": SessionAttentionSnapshot;
  "permission.resolve": boolean;
  "question.resolve": boolean;
  "planApproval.resolve": boolean;
};
