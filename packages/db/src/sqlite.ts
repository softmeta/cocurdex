import { existsSync, renameSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import {
  type AgentCapabilityCacheRepository,
  createSqliteAgentCapabilityCacheRepository,
} from "./agents";
import { createSqliteDecksRepository, type DecksRepository } from "./decks";
import {
  createSqliteEntityLinksRepository,
  type EntityLinksRepository,
} from "./entity-links";
import {
  createSqliteHostAccessRepository,
  type HostAccessRepository,
} from "./host-access";
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
import {
  preMigrationSnapshotPath,
  prunePreMigrationSnapshots,
  snapshotSuffix,
} from "./pre-migration-snapshots";
import { createProviderRepositories } from "./provider-repositories";
import type {
  AgentRoleRepository,
  AppSettingsRepository,
  CommandReceiptRepository,
  ContextTransferRepository,
  EditorViewRepository,
  MessageRepository,
  MessageTurnStatsRepository,
  PendingSettingsChangeRepository,
  ProviderSessionRepository,
  QueuedAgentInputRepository,
  RunRepository,
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
  createSqliteCommandReceiptRepository,
  createSqliteContextTransferRepository,
  createSqliteEditorViewRepository,
  createSqliteMessageRepository,
  createSqliteMessageTurnStatsRepository,
  createSqlitePendingSettingsChangeRepository,
  createSqliteProviderSessionRepository,
  createSqliteQueuedAgentInputRepository,
  createSqliteRunRepository,
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
import { createSqliteSyncRepository, type SyncRepository } from "./sync";
import { createSqliteTeamRepository, type TeamRepository } from "./team";
import {
  createSqliteWorkflowRepository,
  type WorkflowRepository,
} from "./workflow";

export interface CocurdexDatabase {
  notes: NotesRepository;
  decks: DecksRepository;
  entityLinks: EntityLinksRepository;
  issues: IssueTrackerRepository;
  search: SearchRepository;
  workspaces: WorkspaceRepository;
  worktreeEnvironments: WorktreeEnvironmentRepository;
  sessions: SessionRepository;
  messages: MessageRepository;
  runs: RunRepository;
  messageTurnStats: MessageTurnStatsRepository;
  turnChangeSets: TurnChangeSetRepository;
  workflows: WorkflowRepository;
  teams: TeamRepository;
  scriptRuns: ScriptRunRepository;
  hostAccess: HostAccessRepository;
  sessionUsage: SessionUsageRepository;
  toolCalls: ToolCallRepository;
  editorViews: EditorViewRepository;
  providerSessions: ProviderSessionRepository;
  contextTransfers: ContextTransferRepository;
  queuedAgentInputs: QueuedAgentInputRepository;
  sessionAttention: SessionAttentionRepository;
  appSettings: AppSettingsRepository;
  commandReceipts: CommandReceiptRepository;
  sync: SyncRepository;
  pendingSettingsChanges: PendingSettingsChangeRepository;
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
  reclaimFreePages(maxPages: number): { reclaimed: number; remaining: number };
  close(): void;
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

function snapshotBeforeMigration(
  database: DatabaseSync,
  databasePath: string,
): void {
  database.prepare("VACUUM INTO ?").run(preMigrationSnapshotPath(databasePath));
}

const INCREMENTAL_AUTO_VACUUM = 2;

function readPragmaNumber(database: DatabaseSync, pragma: string): number {
  const row = database.prepare(`PRAGMA ${pragma}`).get() as
    | Record<string, number>
    | undefined;
  return row?.[pragma] ?? 0;
}

function ensureIncrementalAutoVacuum(database: DatabaseSync): void {
  if (readPragmaNumber(database, "auto_vacuum") === INCREMENTAL_AUTO_VACUUM) {
    return;
  }
  database.exec("PRAGMA auto_vacuum = INCREMENTAL");
  database.exec("VACUUM");
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
  prunePreMigrationSnapshots(databasePath);
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
  ensureIncrementalAutoVacuum(database);

  return {
    notes: createSqliteNotesRepository(database),
    decks: createSqliteDecksRepository(database),
    entityLinks: createSqliteEntityLinksRepository(database),
    issues: createSqliteIssueTrackerRepository(database),
    search: createSqliteSearchRepository(database),
    workspaces: createSqliteWorkspaceRepository(database),
    worktreeEnvironments: createSqliteWorktreeEnvironmentRepository(database),
    sessions: createSqliteSessionRepository(database),
    messages: createSqliteMessageRepository(database),
    runs: createSqliteRunRepository(database),
    messageTurnStats: createSqliteMessageTurnStatsRepository(database),
    turnChangeSets: createSqliteTurnChangeSetRepository(database),
    workflows: createSqliteWorkflowRepository(database),
    teams: createSqliteTeamRepository(database),
    scriptRuns: createSqliteScriptRunRepository(database),
    hostAccess: createSqliteHostAccessRepository(database),
    sessionUsage: createSqliteSessionUsageRepository(database),
    toolCalls: createSqliteToolCallRepository(database),
    editorViews: createSqliteEditorViewRepository(database),
    providerSessions: createSqliteProviderSessionRepository(database),
    contextTransfers: createSqliteContextTransferRepository(database),
    queuedAgentInputs: createSqliteQueuedAgentInputRepository(database),
    sessionAttention: createSqliteSessionAttentionRepository(database),
    appSettings: createSqliteAppSettingsRepository(database),
    commandReceipts: createSqliteCommandReceiptRepository(database),
    sync: createSqliteSyncRepository(database),
    pendingSettingsChanges:
      createSqlitePendingSettingsChangeRepository(database),
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
    reclaimFreePages(maxPages) {
      const before = readPragmaNumber(database, "freelist_count");
      if (before === 0) {
        return { reclaimed: 0, remaining: 0 };
      }
      database.exec(`PRAGMA incremental_vacuum(${Math.max(1, maxPages)})`);
      const remaining = readPragmaNumber(database, "freelist_count");
      return { reclaimed: before - remaining, remaining };
    },
    close() {
      database.close();
    },
  };
}
