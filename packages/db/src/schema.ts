import { createWorkflowSchemaSql } from "./workflow/schema";

export function createSchemaSql() {
  return `
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      root_path TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_opened_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      agent_type TEXT NOT NULL,
      session_kind TEXT NOT NULL DEFAULT 'main',
      parent_session_id TEXT,
      parent_tool_call_id TEXT,
      status TEXT NOT NULL,
      write_mode TEXT NOT NULL,
      collaboration_mode TEXT NOT NULL DEFAULT 'default',
      permission_mode TEXT,
      provider_snapshot_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT,
      archived_at TEXT,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      kind TEXT,
      content TEXT NOT NULL,
      attachments_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_attention (
      session_id TEXT PRIMARY KEY,
      last_visited_at TEXT,
      latest_result_at TEXT,
      result_disposition TEXT NOT NULL DEFAULT 'automatic'
        CHECK (result_disposition IN ('automatic', 'unread', 'settled')),
      activity_kind TEXT CHECK (activity_kind IN ('foreground', 'background')),
      connection_pending INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS queued_agent_inputs (
      sequence INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL UNIQUE,
      session_id TEXT NOT NULL,
      workspace_root_path TEXT NOT NULL,
      thinking_level TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_queued_agent_inputs_session_sequence
      ON queued_agent_inputs(session_id, sequence);

    CREATE TABLE IF NOT EXISTS tool_calls (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      title TEXT NOT NULL,
      kind TEXT,
      status TEXT NOT NULL,
      content_json TEXT NOT NULL,
      raw_input_json TEXT,
      raw_output_json TEXT,
      locations_json TEXT NOT NULL,
      started_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS session_usage (
      session_id TEXT PRIMARY KEY,
      usage_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS message_turn_stats (
      message_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      usage_json TEXT,
      completed_at TEXT NOT NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS turn_change_sets (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      user_message_id TEXT NOT NULL,
      provider_turn_id TEXT,
      source TEXT NOT NULL,
      coverage TEXT NOT NULL,
      files_json TEXT NOT NULL,
      additions INTEGER,
      deletions INTEGER,
      native_checkpoint_ref TEXT,
      host_before_checkpoint_ref TEXT,
      host_before_checkpoint_kind TEXT,
      host_after_checkpoint_ref TEXT,
      host_after_checkpoint_kind TEXT,
      host_recovery_checkpoint_ref TEXT,
      host_recovery_checkpoint_kind TEXT,
      outcome TEXT,
      native_files_json TEXT,
      undoable INTEGER,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      UNIQUE (session_id, user_message_id)
    );

    CREATE INDEX IF NOT EXISTS idx_turn_change_sets_session
      ON turn_change_sets(session_id, updated_at);

    CREATE INDEX IF NOT EXISTS idx_turn_change_sets_message
      ON turn_change_sets(session_id, message_id);

    CREATE TABLE IF NOT EXISTS editor_views (
      session_id TEXT PRIMARY KEY,
      open_files_json TEXT NOT NULL,
      active_file TEXT,
      selections_json TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS agent_provider_sessions (
      session_id TEXT PRIMARY KEY,
      provider_session_id TEXT,
      provider_state_json TEXT NOT NULL,
      provider_version TEXT,
      resumable INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS provider_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      api_key_secret_id TEXT,
      headers_json TEXT,
      compat_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS provider_models (
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      name TEXT NOT NULL,
      api TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL,
      context_limit INTEGER,
      output_limit INTEGER,
      capabilities_json TEXT,
      reasoning INTEGER NOT NULL DEFAULT 0,
      thinking_level_map_json TEXT,
      cost_json TEXT,
      compat_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (provider_id, model_id),
      FOREIGN KEY (provider_id) REFERENCES provider_configs(id)
        ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS provider_secrets (
      id TEXT PRIMARY KEY,
      encrypted_value TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_provider_defaults (
      agent_id TEXT PRIMARY KEY,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      model_id TEXT NOT NULL,
      system_prompt TEXT,
      preset_id TEXT,
      web_search_enabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_message_at TEXT,
      archived_at TEXT
    );

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content_json TEXT NOT NULL,
      status TEXT NOT NULL,
      usage_json TEXT,
      sources_json TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        ON DELETE CASCADE
    );

    ${createWorkflowSchemaSql()}

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      parent_id TEXT,
      workspace_id TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('note', 'folder')),
      title TEXT NOT NULL,
      icon TEXT,
      body_markdown TEXT NOT NULL DEFAULT '',
      sort_order INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (parent_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL,
      tag_id TEXT NOT NULL,
      PRIMARY KEY (note_id, tag_id),
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS note_links (
      source_note_id TEXT NOT NULL,
      target_note_id TEXT,
      target_ref TEXT NOT NULL,
      kind TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (source_note_id, target_ref, kind),
      FOREIGN KEY (source_note_id) REFERENCES notes(id) ON DELETE CASCADE,
      FOREIGN KEY (target_note_id) REFERENCES notes(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS issues (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description_markdown TEXT NOT NULL DEFAULT '',
      color TEXT,
      status TEXT NOT NULL DEFAULT 'backlog',
      priority TEXT NOT NULL DEFAULT 'none',
      workspace_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS issue_views (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      icon TEXT,
      group_by TEXT NOT NULL CHECK (group_by IN ('status', 'priority')),
      layout TEXT NOT NULL CHECK (layout IN ('board', 'list')),
      filters_json TEXT NOT NULL DEFAULT '[]',
      revision INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS issue_view_columns (
      view_id TEXT NOT NULL,
      field TEXT NOT NULL CHECK (field IN ('status', 'priority')),
      id TEXT NOT NULL,
      title TEXT NOT NULL,
      color TEXT,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (view_id, field, id),
      FOREIGN KEY (view_id) REFERENCES issue_views(id) ON DELETE CASCADE
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS note_fts USING fts5(
      note_id UNINDEXED,
      title,
      body,
      tokenize = 'trigram'
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS issue_fts USING fts5(
      issue_id UNINDEXED,
      title,
      body,
      tokenize = 'trigram'
    );

    CREATE TRIGGER IF NOT EXISTS notes_fts_insert
    AFTER INSERT ON notes
    WHEN new.kind = 'note'
    BEGIN
      INSERT INTO note_fts(note_id, title, body)
      VALUES (new.id, new.title, new.body_markdown);
    END;

    CREATE TRIGGER IF NOT EXISTS notes_fts_update
    AFTER UPDATE ON notes
    BEGIN
      DELETE FROM note_fts WHERE note_id = old.id;
      INSERT INTO note_fts(note_id, title, body)
      SELECT new.id, new.title, new.body_markdown
      WHERE new.kind = 'note';
    END;

    CREATE TRIGGER IF NOT EXISTS notes_fts_delete
    AFTER DELETE ON notes
    BEGIN
      DELETE FROM note_fts WHERE note_id = old.id;
    END;

    CREATE TRIGGER IF NOT EXISTS issues_fts_insert
    AFTER INSERT ON issues
    BEGIN
      INSERT INTO issue_fts(issue_id, title, body)
      VALUES (new.id, new.title, new.description_markdown);
    END;

    CREATE TRIGGER IF NOT EXISTS issues_fts_update
    AFTER UPDATE ON issues
    BEGIN
      DELETE FROM issue_fts WHERE issue_id = old.id;
      INSERT INTO issue_fts(issue_id, title, body)
      VALUES (new.id, new.title, new.description_markdown);
    END;

    CREATE TRIGGER IF NOT EXISTS issues_fts_delete
    AFTER DELETE ON issues
    BEGIN
      DELETE FROM issue_fts WHERE issue_id = old.id;
    END;

    CREATE INDEX IF NOT EXISTS idx_messages_session_created
      ON messages(session_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_tool_calls_session_started
      ON tool_calls(session_id, started_at);

    CREATE INDEX IF NOT EXISTS idx_conv_messages_conv_created
      ON conversation_messages(conversation_id, created_at);

    CREATE INDEX IF NOT EXISTS idx_notes_parent_sort
      ON notes(parent_id, sort_order, title);

    CREATE INDEX IF NOT EXISTS idx_notes_workspace
      ON notes(workspace_id);

    CREATE INDEX IF NOT EXISTS idx_note_links_target
      ON note_links(target_note_id);

    CREATE INDEX IF NOT EXISTS idx_issues_status_sort
      ON issues(status, sort_order);

    CREATE INDEX IF NOT EXISTS idx_issues_priority_sort
      ON issues(priority, sort_order);

    CREATE INDEX IF NOT EXISTS idx_issues_workspace
      ON issues(workspace_id);

    CREATE INDEX IF NOT EXISTS idx_issue_view_columns_sort
      ON issue_view_columns(view_id, field, sort_order);
  `;
}
