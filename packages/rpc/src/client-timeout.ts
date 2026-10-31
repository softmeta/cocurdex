import type { DaemonMethod } from "@cocurdex/rpc";

const METHOD_TIMEOUTS: Partial<Record<DaemonMethod, number>> = {
  "daemon.status": 2_000,
  "daemon.subscribe": 5_000,
  "daemon.shutdownIfIdle": 5_000,
  "diagnostics.export": 2 * 60_000,
  "workspace.runWorktreeSetup": 15 * 60_000,
  "worktree.create": 15 * 60_000,
  "worktree.remove": 15 * 60_000,
  "session.refineTitle": 2 * 60_000,
  "codex.login.wait": 30 * 60_000,
  "mcp.status": 3 * 60_000,
  "mcp.server.test": 3 * 60_000,
  "mcp.login.start": 3 * 60_000,
  "mcp.login.wait": 10 * 60_000,
  "deck.import": 2 * 60_000,
  "deck.readPptx": 2 * 60_000,
  "git.generateCommitMessage": 2 * 60_000,
  "git.commit": 2 * 60_000,
  "git.push": 10 * 60_000,
  "session.undoTurnChanges": 5 * 60_000,
  "session.send": 2 * 60_000,
  "session.resumeQueued": 2 * 60_000,
  "session.sendQueuedNow": 2 * 60_000,
  "provider.auth.login.next": 30 * 60_000,
  "acpRegistry.install": 30 * 60_000,
  "skills.source.inspect": 5 * 60_000,
  "skills.source.show": 5 * 60_000,
  "skills.add": 5 * 60_000,
  "skills.updates.check": 10 * 60_000,
  "skills.updates.preview": 5 * 60_000,
  "skills.updates.apply": 10 * 60_000,
  "memory.status": 2 * 60_000,
  "memory.recall": 2 * 60_000,
  "memory.show": 60_000,
  "memory.remember": 4 * 60_000,
  "memory.session.save": 5 * 60_000,
  "memory.install": 6 * 60_000,
  "memory.doctor": 4 * 60_000,
  "memory.cloud.connect": 3 * 60_000,
  "memory.cloud.disconnect": 90_000,
  "memory.cloud.setSync": 90_000,
  "memory.cloud.keys": 90_000,
};

const DEFAULT_TIMEOUT_MS = 30_000;

export function isLongRunningDaemonMethod(method: string) {
  const timeout = METHOD_TIMEOUTS[method as DaemonMethod];
  return timeout !== undefined && timeout > DEFAULT_TIMEOUT_MS;
}

export function daemonRequestTimeout(method: DaemonMethod, override?: number) {
  const timeout = override ?? METHOD_TIMEOUTS[method] ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2_147_483_647) {
    throw new Error(
      "Daemon request timeout must be a positive finite number of milliseconds",
    );
  }
  return timeout;
}
