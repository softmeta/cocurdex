import { homedir } from "node:os";
import { killProcessTree } from "@cocurdex/agent-adapters";
import type {
  PtySpawnPayload,
  PtySpawnResult,
  TerminalDaemonEvent,
} from "@cocurdex/shared";
import { hashLogValue, workspacePathsEqual } from "@cocurdex/shared";
import type { IPty } from "node-pty";
import { logDaemonDiagnostic } from "../diagnostics";
import { loadNodePty } from "../packaged-module";
import { defaultShellArgs, resolveDefaultShell } from "./default-shell";
import { inspectSessions, type PtyActivity } from "./process-inspector";
import { createPtyDataBuffer } from "./pty-data-buffer";
import { buildTerminalEnv } from "./terminal-env";

const ACTIVITY_POLL_MS = 1500;
const DETACHED_GRACE_MS = 30_000;

interface TerminalSession {
  pty: IPty;
  shell: string;
  cwd: string;
  workspaceId: string;
  lastActivity: PtyActivity | null;
}

export interface TerminalServiceOptions {
  emit(event: TerminalDaemonEvent): void;
  listWorkspaceRootPaths(): Promise<string[]>;
  detachedGraceMs?: number;
}

function warn(event: string, details: Record<string, unknown>) {
  logDaemonDiagnostic("warn", event, details);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class TerminalService {
  private readonly sessions = new Map<string, TerminalSession>();
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  private detachedTimer: ReturnType<typeof setTimeout> | null = null;
  private polling = false;
  private clients = 0;
  private readonly dataBuffer = createPtyDataBuffer((event) =>
    this.options.emit({ type: "terminal.data", ...event }),
  );

  constructor(private readonly options: TerminalServiceOptions) {}

  get activeCount() {
    return this.sessions.size;
  }

  retainClient(): () => void {
    this.clients += 1;
    this.cancelDetachedTimer();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.clients -= 1;
      if (this.clients === 0) this.scheduleDetachedCleanup();
    };
  }

  private cancelDetachedTimer() {
    if (this.detachedTimer) {
      clearTimeout(this.detachedTimer);
      this.detachedTimer = null;
    }
  }

  private scheduleDetachedCleanup() {
    this.cancelDetachedTimer();
    if (this.sessions.size === 0) return;
    this.detachedTimer = setTimeout(() => {
      this.detachedTimer = null;
      if (this.clients === 0) void this.dispose();
    }, this.options.detachedGraceMs ?? DETACHED_GRACE_MS);
    this.detachedTimer.unref?.();
  }

  private ensureActivityPoller() {
    if (this.activityTimer || process.platform === "win32") {
      return;
    }
    void this.pollActivity();
    this.activityTimer = setInterval(() => {
      void this.pollActivity();
    }, ACTIVITY_POLL_MS);
    this.activityTimer.unref?.();
  }

  private stopActivityPollerIfIdle() {
    if (this.activityTimer && this.sessions.size === 0) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
  }

  private async pollActivity() {
    if (this.polling || this.sessions.size === 0) {
      return;
    }
    this.polling = true;
    try {
      const sessions = [...this.sessions.entries()];
      const activities = await inspectSessions(
        sessions.map(([, session]) => session.pty.pid),
      );
      for (const [terminalId, session] of sessions) {
        if (!this.sessions.has(terminalId)) {
          continue;
        }
        const next = activities.get(session.pty.pid);
        if (!next) {
          continue;
        }
        const prev = session.lastActivity;
        if (
          prev &&
          prev.foregroundProcess === next.foregroundProcess &&
          prev.cwd === next.cwd
        ) {
          continue;
        }
        session.lastActivity = next;
        this.options.emit({
          type: "terminal.activity",
          terminalId,
          workspaceId: session.workspaceId,
          foregroundProcess: next.foregroundProcess,
          cwd: next.cwd,
        });
      }
    } finally {
      this.polling = false;
    }
  }

  private async assertAllowedCwd(cwd: string) {
    if (workspacePathsEqual(cwd, homedir())) return;
    const rootPaths = await this.options.listWorkspaceRootPaths();
    if (rootPaths.some((rootPath) => workspacePathsEqual(cwd, rootPath))) {
      return;
    }
    throw new Error(
      "terminal.spawn rejected: cwd is not a registered workspace root or home directory",
    );
  }

  async spawn(payload: PtySpawnPayload): Promise<PtySpawnResult> {
    const existing = this.sessions.get(payload.terminalId);
    if (existing) {
      this.resizeSession(
        payload.terminalId,
        existing,
        payload.cols,
        payload.rows,
      );
      return {
        terminalId: payload.terminalId,
        workspaceId: existing.workspaceId,
        pid: existing.pty.pid,
        shell: existing.shell,
        cwd: existing.cwd,
      };
    }
    await this.assertAllowedCwd(payload.cwd);
    const { spawn: spawnPty } = await loadNodePty();
    const shell = resolveDefaultShell(process.platform, process.env);
    const pty = spawnPty(shell, defaultShellArgs(process.platform, shell), {
      name: "xterm-256color",
      cols: payload.cols,
      rows: payload.rows,
      cwd: payload.cwd,
      env: buildTerminalEnv(process.env),
      useConpty: process.platform === "win32",
    });

    pty.onData((data) => {
      this.dataBuffer.append(payload.terminalId, payload.workspaceId, data);
    });

    pty.onExit(({ exitCode, signal }) => {
      this.dataBuffer.flush(payload.terminalId);
      if (this.sessions.get(payload.terminalId)?.pty !== pty) {
        return;
      }
      this.sessions.delete(payload.terminalId);
      this.stopActivityPollerIfIdle();
      this.options.emit({
        type: "terminal.exit",
        terminalId: payload.terminalId,
        workspaceId: payload.workspaceId,
        exitCode,
        signal,
      });
    });

    this.sessions.set(payload.terminalId, {
      pty,
      shell,
      cwd: payload.cwd,
      workspaceId: payload.workspaceId,
      lastActivity: null,
    });
    this.ensureActivityPoller();
    if (this.clients === 0) this.scheduleDetachedCleanup();

    logDaemonDiagnostic("info", "terminal.spawned", {
      terminalId: payload.terminalId,
      workspaceId: payload.workspaceId,
      pid: pty.pid,
      shell,
      workingDirHash: hashLogValue(payload.cwd),
      platform: process.platform,
    });

    return {
      terminalId: payload.terminalId,
      workspaceId: payload.workspaceId,
      pid: pty.pid,
      shell,
      cwd: payload.cwd,
    };
  }

  write(terminalId: string, data: string) {
    this.sessions.get(terminalId)?.pty.write(data);
  }

  resize(terminalId: string, cols: number, rows: number) {
    const session = this.sessions.get(terminalId);
    if (session) this.resizeSession(terminalId, session, cols, rows);
  }

  private resizeSession(
    terminalId: string,
    session: TerminalSession,
    cols: number,
    rows: number,
  ) {
    try {
      session.pty.resize(cols, rows);
    } catch (error) {
      warn("terminal.resizeFailed", { terminalId, error: errorMessage(error) });
    }
  }

  kill(terminalId: string) {
    const session = this.sessions.get(terminalId);
    if (!session) {
      return;
    }
    this.sessions.delete(terminalId);
    void this.terminate(terminalId, session);
    this.stopActivityPollerIfIdle();
  }

  private async terminate(terminalId: string, session: TerminalSession) {
    const killTree = () =>
      killProcessTree(session.pty.pid).catch((error: unknown) => {
        warn("terminal.killTreeFailed", {
          terminalId,
          error: errorMessage(error),
        });
      });
    const killPty = () => {
      try {
        session.pty.kill();
      } catch (error) {
        warn("terminal.killFailed", { terminalId, error: errorMessage(error) });
      }
    };
    if (process.platform === "win32") {
      killPty();
      await killTree();
      return;
    }
    await killTree();
    killPty();
  }

  async dispose() {
    this.cancelDetachedTimer();
    const sessions = [...this.sessions];
    this.sessions.clear();
    this.dataBuffer.dispose();
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
    await Promise.allSettled(
      sessions.map(([terminalId, session]) =>
        this.terminate(terminalId, session),
      ),
    );
  }
}
