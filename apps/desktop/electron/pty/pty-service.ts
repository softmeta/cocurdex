import os from "node:os";
import type {
  PtyActivityEvent,
  PtyExitEvent,
  PtySpawnPayload,
  PtySpawnResult,
} from "@cocurdex/shared";
import type { BrowserWindow } from "electron";
import type { IPty } from "node-pty";
import { spawn as ptySpawn } from "node-pty";
import { createLogger } from "../logging";
import { terminateProcessTree } from "../process";
import { inspectSessions, type PtyActivity } from "./process-inspector";
import { createPtyDataBuffer } from "./pty-data-buffer";

const logger = createLogger("pty-service");

// How often to re-derive each terminal's foreground process / cwd. Cheap
// enough (two short-lived OS calls per tick regardless of session count) to
// keep the tab labels live without noticeable overhead.
const ACTIVITY_POLL_MS = 1500;

interface PtySession {
  pty: IPty;
  shell: string;
  cwd: string;
  workspaceId: string;
  // Last activity broadcast, so the poller only emits on change.
  lastActivity: PtyActivity | null;
}

function defaultShell(): string {
  if (process.platform === "win32") {
    return process.env.COMSPEC ?? "powershell.exe";
  }
  return process.env.SHELL ?? "/bin/zsh";
}

// Strip Electron/dev variables that would leak into the user's shell and
// confuse tools (e.g. ELECTRON_RUN_AS_NODE flips Node-mode on launch).
function sanitizeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env } as NodeJS.ProcessEnv;
  env.ELECTRON_RUN_AS_NODE = undefined;
  env.ELECTRON_NO_ATTACH_CONSOLE = undefined;
  env.TERM = env.TERM ?? "xterm-256color";
  env.COLORTERM = env.COLORTERM ?? "truecolor";
  env.LANG = env.LANG ?? "en_US.UTF-8";
  return env;
}

export class PtyService {
  private readonly sessions = new Map<string, PtySession>();
  private window: BrowserWindow | null = null;
  private activityTimer: ReturnType<typeof setInterval> | null = null;
  // Guards against overlapping polls when an OS call runs long.
  private polling = false;
  // Coalesces per-chunk pty output into one IPC message per flush tick.
  private readonly dataBuffer = createPtyDataBuffer((event) =>
    this.send("pty:data", event),
  );

  attachWindow(window: BrowserWindow) {
    this.window = window;
  }

  private send(channel: string, payload: unknown) {
    const win = this.window;
    if (!win || win.isDestroyed()) {
      return;
    }
    win.webContents.send(channel, payload);
  }

  private ensureActivityPoller() {
    if (this.activityTimer || process.platform === "win32") {
      return;
    }
    // Kick off immediately so labels populate without waiting a full interval,
    // then settle into the steady cadence.
    void this.pollActivity();
    this.activityTimer = setInterval(() => {
      void this.pollActivity();
    }, ACTIVITY_POLL_MS);
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
        // Re-check: the session may have exited mid-poll.
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
        const event: PtyActivityEvent = {
          terminalId,
          workspaceId: session.workspaceId,
          foregroundProcess: next.foregroundProcess,
          cwd: next.cwd,
        };
        this.send("pty:activity", event);
      }
    } finally {
      this.polling = false;
    }
  }

  spawn(payload: PtySpawnPayload): PtySpawnResult {
    const existing = this.sessions.get(payload.terminalId);
    if (existing) {
      // Re-attach: caller (renderer) likely remounted xterm. Resize to whatever
      // the renderer currently has and reuse the running shell so scrollback
      // owned by node-pty (kernel-side) and the prior process tree survive.
      try {
        existing.pty.resize(payload.cols, payload.rows);
      } catch (error) {
        logger.warn("pty.resizeFailed", {
          terminalId: payload.terminalId,
          workspaceId: payload.workspaceId,
          error,
        });
      }
      return {
        terminalId: payload.terminalId,
        workspaceId: payload.workspaceId,
        pid: existing.pty.pid,
        shell: existing.shell,
        cwd: existing.cwd,
      };
    }

    const shell = defaultShell();
    // POSIX shells need `-l` so the user's login profile (`~/.zprofile`,
    // `~/.bash_profile`) runs — that's where Homebrew, nvm, asdf, and other
    // PATH bootstrapping live. Without it the GUI-launched Electron PATH
    // (which omits /opt/homebrew/bin, ~/.cargo/bin, etc.) propagates to the
    // shell and `git` / `node` / `brew` can be missing. PowerShell rejects
    // `-l`, so we keep an empty arg list on Windows.
    const args = process.platform === "win32" ? [] : ["-l"];
    const pty = ptySpawn(shell, args, {
      name: "xterm-256color",
      cols: payload.cols,
      rows: payload.rows,
      cwd: payload.cwd,
      env: sanitizeEnv(),
      useConpty: process.platform === "win32",
    });

    pty.onData((data) => {
      this.dataBuffer.append(payload.terminalId, payload.workspaceId, data);
    });

    pty.onExit(({ exitCode, signal }) => {
      // Deliver any buffered output before the exit event so the renderer
      // never observes an exited terminal with trailing data still pending.
      this.dataBuffer.flush(payload.terminalId);
      // A restart replaces the session under the same terminalId before the
      // old pty's async exit fires. Only clean up and broadcast if this pty
      // still owns the session — otherwise we would delete the fresh session
      // and mark the live replacement shell as exited in the renderer.
      if (this.sessions.get(payload.terminalId)?.pty !== pty) {
        return;
      }
      this.sessions.delete(payload.terminalId);
      this.stopActivityPollerIfIdle();
      const event: PtyExitEvent = {
        terminalId: payload.terminalId,
        workspaceId: payload.workspaceId,
        exitCode,
        signal,
      };
      this.send("pty:exit", event);
    });

    this.sessions.set(payload.terminalId, {
      pty,
      shell,
      cwd: payload.cwd,
      workspaceId: payload.workspaceId,
      lastActivity: null,
    });
    this.ensureActivityPoller();

    logger.info("pty.spawned", {
      terminalId: payload.terminalId,
      workspaceId: payload.workspaceId,
      pid: pty.pid,
      shell,
      cwd: payload.cwd,
      platform: os.platform(),
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
    const session = this.sessions.get(terminalId);
    if (!session) {
      logger.debug("pty.writeMissingSession", { terminalId });
      return;
    }
    session.pty.write(data);
  }

  resize(terminalId: string, cols: number, rows: number) {
    const session = this.sessions.get(terminalId);
    if (!session) {
      return;
    }
    try {
      session.pty.resize(cols, rows);
    } catch (error) {
      logger.warn("pty.resizeFailed", { terminalId, error });
    }
  }

  kill(terminalId: string) {
    const session = this.sessions.get(terminalId);
    if (!session) {
      return;
    }
    this.sessions.delete(terminalId);
    try {
      session.pty.kill();
      void terminateProcessTree(session.pty.pid).catch((error) => {
        logger.warn("pty.killTreeFailed", { terminalId, error });
      });
    } catch (error) {
      logger.warn("pty.killFailed", { terminalId, error });
    }
    this.stopActivityPollerIfIdle();
  }

  async dispose() {
    const treeShutdowns: Promise<void>[] = [];
    for (const [terminalId, session] of this.sessions) {
      try {
        session.pty.kill();
        treeShutdowns.push(
          terminateProcessTree(session.pty.pid).catch((error) => {
            logger.warn("pty.disposeKillTreeFailed", { terminalId, error });
          }),
        );
      } catch (error) {
        logger.warn("pty.disposeKillFailed", { terminalId, error });
      }
    }
    await Promise.allSettled(treeShutdowns);
    this.sessions.clear();
    this.dataBuffer.dispose();
    if (this.activityTimer) {
      clearInterval(this.activityTimer);
      this.activityTimer = null;
    }
    this.window = null;
  }
}

let singleton: PtyService | null = null;

export function getPtyService(): PtyService {
  if (!singleton) {
    singleton = new PtyService();
  }
  return singleton;
}
