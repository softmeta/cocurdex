import type { DaemonMethod } from "@cocurdex/rpc";

const METHOD_TIMEOUTS: Partial<Record<DaemonMethod, number>> = {
  "daemon.status": 2_000,
  "daemon.subscribe": 5_000,
  "daemon.shutdownIfIdle": 5_000,
  "workspace.runWorktreeSetup": 15 * 60_000,
  "worktree.create": 15 * 60_000,
  "worktree.remove": 15 * 60_000,
  "session.generateTitle": 2 * 60_000,
  "git.generateCommitMessage": 2 * 60_000,
  "session.undoTurnChanges": 5 * 60_000,
  "session.send": 2 * 60_000,
  "session.resumeQueued": 2 * 60_000,
};

export function daemonRequestTimeout(method: DaemonMethod, override?: number) {
  const timeout = override ?? METHOD_TIMEOUTS[method] ?? 30_000;
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2_147_483_647) {
    throw new Error(
      "Daemon request timeout must be a positive finite number of milliseconds",
    );
  }
  return timeout;
}
