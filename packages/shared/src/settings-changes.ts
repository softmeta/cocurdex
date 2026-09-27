// A queued change to a renderer-owned app setting. Agent tools write these
// through the daemon; the desktop client applies them to its own stores and
// acknowledges them so the queue drains.
export interface PendingSettingsChangeRecord {
  id: string;
  key: string;
  value: unknown;
  createdAt: string;
}
