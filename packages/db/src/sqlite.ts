import { rmSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  createSqliteIssueTrackerRepository,
  type IssueTrackerRepository,
} from "./issues";
import { initializeDatabase, shouldRecreateDatabase } from "./migrations";
import { createSqliteNotesRepository, type NotesRepository } from "./notes";
import { createProviderRepositories } from "./provider-repositories";
import type {
  AppSettingsRepository,
  ConversationMessageRepository,
  ConversationRepository,
  EditorViewRepository,
  MessageRepository,
  MessageTurnStatsRepository,
  ProviderSessionRepository,
  QueuedAgentInputRepository,
  SessionAttentionRepository,
  SessionRepository,
  SessionUsageRepository,
  ToolCallRepository,
  TurnChangeSetRepository,
  WorkspaceRepository,
} from "./repositories";
import {
  createSqliteAppSettingsRepository,
  createSqliteConversationMessageRepository,
  createSqliteConversationRepository,
  createSqliteEditorViewRepository,
  createSqliteMessageRepository,
  createSqliteMessageTurnStatsRepository,
  createSqliteProviderSessionRepository,
  createSqliteQueuedAgentInputRepository,
  createSqliteSessionAttentionRepository,
  createSqliteSessionRepository,
  createSqliteSessionUsageRepository,
  createSqliteToolCallRepository,
  createSqliteTurnChangeSetRepository,
  createSqliteWorkspaceRepository,
} from "./repositories";
import { createSqliteSearchRepository, type SearchRepository } from "./search";
import {
  createSqliteWorkflowRepository,
  type WorkflowRepository,
} from "./workflow";

export interface CocurdexDatabase {
  notes: NotesRepository;
  issues: IssueTrackerRepository;
  search: SearchRepository;
  workspaces: WorkspaceRepository;
  sessions: SessionRepository;
  messages: MessageRepository;
  messageTurnStats: MessageTurnStatsRepository;
  turnChangeSets: TurnChangeSetRepository;
  workflows: WorkflowRepository;
  sessionUsage: SessionUsageRepository;
  toolCalls: ToolCallRepository;
  editorViews: EditorViewRepository;
  providerSessions: ProviderSessionRepository;
  queuedAgentInputs: QueuedAgentInputRepository;
  sessionAttention: SessionAttentionRepository;
  conversations: ConversationRepository;
  conversationMessages: ConversationMessageRepository;
  appSettings: AppSettingsRepository;
  providerConfigs: ReturnType<
    typeof createProviderRepositories
  >["providerConfigs"];
  providerModels: ReturnType<
    typeof createProviderRepositories
  >["providerModels"];
  providerSecrets: ReturnType<
    typeof createProviderRepositories
  >["providerSecrets"];
  agentProviderDefaults: ReturnType<
    typeof createProviderRepositories
  >["agentProviderDefaults"];
  /**
   * Run a set of repository writes atomically. The callback must be synchronous:
   * node:sqlite is a single synchronous connection, so awaiting inside a
   * transaction would let another write interleave between BEGIN and COMMIT.
   * Repository methods write synchronously, so call them without awaiting here.
   */
  transaction<T>(fn: () => T): T;
  close(): void;
}

function removePreReleaseDatabase(databasePath: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${databasePath}${suffix}`, { force: true });
  }
}

function openDatabase(databasePath: string): DatabaseSync {
  let database = new DatabaseSync(databasePath);
  if (shouldRecreateDatabase(database)) {
    database.close();
    removePreReleaseDatabase(databasePath);
    database = new DatabaseSync(databasePath);
  }
  return database;
}

export function createCocurdexDatabase(databasePath: string): CocurdexDatabase {
  const database = openDatabase(databasePath);
  // WAL keeps writers from blocking readers and survives crashes without
  // corrupting the file; NORMAL fsyncs only at checkpoints, which matters because
  // streaming writes commit frequently. busy_timeout avoids SQLITE_BUSY if a
  // second connection (e.g. a future sync worker) briefly contends.
  database.exec("PRAGMA journal_mode = WAL");
  database.exec("PRAGMA synchronous = NORMAL");
  database.exec("PRAGMA busy_timeout = 5000");
  database.exec("PRAGMA foreign_keys = ON");
  initializeDatabase(database);

  return {
    notes: createSqliteNotesRepository(database),
    issues: createSqliteIssueTrackerRepository(database),
    search: createSqliteSearchRepository(database),
    workspaces: createSqliteWorkspaceRepository(database),
    sessions: createSqliteSessionRepository(database),
    messages: createSqliteMessageRepository(database),
    messageTurnStats: createSqliteMessageTurnStatsRepository(database),
    turnChangeSets: createSqliteTurnChangeSetRepository(database),
    workflows: createSqliteWorkflowRepository(database),
    sessionUsage: createSqliteSessionUsageRepository(database),
    toolCalls: createSqliteToolCallRepository(database),
    editorViews: createSqliteEditorViewRepository(database),
    providerSessions: createSqliteProviderSessionRepository(database),
    queuedAgentInputs: createSqliteQueuedAgentInputRepository(database),
    sessionAttention: createSqliteSessionAttentionRepository(database),
    conversations: createSqliteConversationRepository(database),
    conversationMessages: createSqliteConversationMessageRepository(database),
    appSettings: createSqliteAppSettingsRepository(database),
    ...createProviderRepositories(database),
    transaction(fn) {
      database.exec("BEGIN");
      try {
        const result = fn();
        database.exec("COMMIT");
        return result;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    close() {
      database.close();
    },
  };
}
