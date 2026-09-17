import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  type AgentCapabilityCacheRepository,
  createSqliteAgentCapabilityCacheRepository,
} from "./agents";
import {
  createSqliteIssueTrackerRepository,
  type IssueTrackerRepository,
} from "./issues";
import {
  hasPendingMigration,
  initializeDatabase,
  shouldRecreateDatabase,
} from "./migrations";
import { createSqliteNotesRepository, type NotesRepository } from "./notes";
import { createProviderRepositories } from "./provider-repositories";
import type {
  AgentRoleRepository,
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
  WorktreeEnvironmentRepository,
} from "./repositories";
import {
  createSqliteAgentRoleRepository,
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
  createSqliteWorktreeEnvironmentRepository,
} from "./repositories";
import {
  createSqliteScriptRunRepository,
  type ScriptRunRepository,
} from "./script-run";
import { createSqliteSearchRepository, type SearchRepository } from "./search";
import { createSqliteTeamRepository, type TeamRepository } from "./team";
import {
  createSqliteWorkflowRepository,
  type WorkflowRepository,
} from "./workflow";

export interface CocurdexDatabase {
  notes: NotesRepository;
  issues: IssueTrackerRepository;
  search: SearchRepository;
  workspaces: WorkspaceRepository;
  worktreeEnvironments: WorktreeEnvironmentRepository;
  sessions: SessionRepository;
  messages: MessageRepository;
  messageTurnStats: MessageTurnStatsRepository;
  turnChangeSets: TurnChangeSetRepository;
  workflows: WorkflowRepository;
  teams: TeamRepository;
  scriptRuns: ScriptRunRepository;
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
  agentRoles: AgentRoleRepository;
  agentCapabilityCache: AgentCapabilityCacheRepository;
  /**
   * Run a set of repository writes atomically. The callback must be synchronous:
   * node:sqlite is a single synchronous connection, so awaiting inside a
   * transaction would let another write interleave between BEGIN and COMMIT.
   * Repository methods write synchronously, so call them without awaiting here.
   */
  transaction<T>(fn: () => T): T;
  close(): void;
}

const PRE_MIGRATION_SNAPSHOT_PREFIX = ".pre-migration-";
const PRE_MIGRATION_SNAPSHOT_LIMIT = 3;

function snapshotSuffix() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${timestamp}-${randomBytes(3).toString("hex")}`;
}

function backUpPreReleaseDatabase(databasePath: string): void {
  const suffix = `.bak-${snapshotSuffix()}`;
  for (const part of ["", "-wal", "-shm"]) {
    const source = `${databasePath}${part}`;
    if (existsSync(source)) {
      renameSync(source, `${source}${suffix}`);
    }
  }
}

function prunePreMigrationSnapshots(databasePath: string): void {
  const directory = path.dirname(databasePath);
  const prefix = `${path.basename(databasePath)}${PRE_MIGRATION_SNAPSHOT_PREFIX}`;
  const stale = readdirSync(directory)
    .filter((name) => name.startsWith(prefix))
    .sort()
    .reverse()
    .slice(PRE_MIGRATION_SNAPSHOT_LIMIT);
  for (const name of stale) {
    rmSync(path.join(directory, name), { force: true });
  }
}

function snapshotBeforeMigration(
  database: DatabaseSync,
  databasePath: string,
): void {
  database
    .prepare("VACUUM INTO ?")
    .run(`${databasePath}${PRE_MIGRATION_SNAPSHOT_PREFIX}${snapshotSuffix()}`);
  prunePreMigrationSnapshots(databasePath);
}

function openDatabase(databasePath: string): DatabaseSync {
  let database = new DatabaseSync(databasePath);
  if (shouldRecreateDatabase(database)) {
    database.close();
    backUpPreReleaseDatabase(databasePath);
    database = new DatabaseSync(databasePath);
  }
  if (hasPendingMigration(database)) {
    snapshotBeforeMigration(database, databasePath);
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
    worktreeEnvironments: createSqliteWorktreeEnvironmentRepository(database),
    sessions: createSqliteSessionRepository(database),
    messages: createSqliteMessageRepository(database),
    messageTurnStats: createSqliteMessageTurnStatsRepository(database),
    turnChangeSets: createSqliteTurnChangeSetRepository(database),
    workflows: createSqliteWorkflowRepository(database),
    teams: createSqliteTeamRepository(database),
    scriptRuns: createSqliteScriptRunRepository(database),
    sessionUsage: createSqliteSessionUsageRepository(database),
    toolCalls: createSqliteToolCallRepository(database),
    editorViews: createSqliteEditorViewRepository(database),
    providerSessions: createSqliteProviderSessionRepository(database),
    queuedAgentInputs: createSqliteQueuedAgentInputRepository(database),
    sessionAttention: createSqliteSessionAttentionRepository(database),
    conversations: createSqliteConversationRepository(database),
    conversationMessages: createSqliteConversationMessageRepository(database),
    appSettings: createSqliteAppSettingsRepository(database),
    agentRoles: createSqliteAgentRoleRepository(database),
    agentCapabilityCache: createSqliteAgentCapabilityCacheRepository(database),
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
