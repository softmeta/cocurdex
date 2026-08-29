import { execFile } from "node:child_process";
import { readlink } from "node:fs/promises";
import { promisify } from "node:util";
import { createLogger } from "../logging";

const execFileAsync = promisify(execFile);
const logger = createLogger("pty-inspector");

// What's running in a terminal, derived from the OS process tree. node-pty
// exposes no foreground-process API, so we inspect the shell's descendants.
export interface PtyActivity {
  foregroundProcess: string | null;
  cwd: string | null;
}

interface ProcNode {
  pid: number;
  ppid: number;
  command: string;
}

// Reduce a full command line to a friendly name: "/usr/bin/vim file" -> "vim",
// "-zsh" (login shell) -> "zsh", "node /x/cli.js --foo" -> "node".
function commandName(command: string): string | null {
  const first = command.trim().split(/\s+/)[0];
  if (!first) {
    return null;
  }
  const base = first.replace(/^-/, "").split(/[/\\]/).pop();
  return base ? base.replace(/\.exe$/i, "") : null;
}

async function listProcesses(): Promise<ProcNode[]> {
  // BSD vs procps option spelling differ; `command=` (headerless) works on both.
  const args =
    process.platform === "darwin"
      ? ["-axo", "pid=,ppid=,command="]
      : ["-eo", "pid=,ppid=,command="];
  const { stdout } = await execFileAsync("ps", args, { timeout: 2000 });
  const nodes: ProcNode[] = [];
  for (const line of stdout.split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (!match) {
      continue;
    }
    nodes.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      command: match[3],
    });
  }
  return nodes;
}

// Walk from a shell pid down to its deepest descendant, always following the
// most-recently-spawned child (highest pid). That leaf is the user's current
// foreground command; if the shell has no children it is idle.
function findForeground(
  shellPid: number,
  childrenByParent: Map<number, ProcNode[]>,
  byPid: Map<number, ProcNode>,
): { leafPid: number; command: string | null } {
  let current = shellPid;
  for (;;) {
    const children = childrenByParent.get(current);
    if (!children || children.length === 0) {
      break;
    }
    const next = children.reduce((a, b) => (b.pid > a.pid ? b : a));
    current = next.pid;
  }
  if (current === shellPid) {
    return { leafPid: shellPid, command: null };
  }
  return {
    leafPid: current,
    command: commandName(byPid.get(current)?.command ?? ""),
  };
}

async function resolveCwds(pids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  if (pids.length === 0) {
    return result;
  }
  if (process.platform === "linux") {
    await Promise.all(
      pids.map(async (pid) => {
        try {
          result.set(pid, await readlink(`/proc/${pid}/cwd`));
        } catch {
          // Process may have exited or be inaccessible; skip.
        }
      }),
    );
    return result;
  }
  if (process.platform === "darwin") {
    try {
      // One batched lsof call: `-Fpn` emits `p<pid>` then `n<path>` records.
      const { stdout } = await execFileAsync(
        "lsof",
        ["-a", "-d", "cwd", "-Fpn", "-p", pids.join(",")],
        { timeout: 2000 },
      );
      let currentPid = -1;
      for (const line of stdout.split("\n")) {
        if (line.startsWith("p")) {
          currentPid = Number(line.slice(1));
        } else if (line.startsWith("n") && currentPid !== -1) {
          result.set(currentPid, line.slice(1));
        }
      }
    } catch {
      // lsof can be slow or restricted; cwd stays unresolved.
    }
    return result;
  }
  // Windows: no cheap foreground-cwd probe; left unresolved.
  return result;
}

// Inspect a batch of shell pids in two OS calls total (one `ps`, one `lsof` on
// macOS / parallel /proc reads on Linux), keyed back by shell pid.
export async function inspectSessions(
  shellPids: number[],
): Promise<Map<number, PtyActivity>> {
  const activities = new Map<number, PtyActivity>();
  if (shellPids.length === 0 || process.platform === "win32") {
    return activities;
  }
  let nodes: ProcNode[];
  try {
    nodes = await listProcesses();
  } catch (error) {
    logger.debug("inspect.psFailed", { error });
    return activities;
  }

  const byPid = new Map<number, ProcNode>();
  const childrenByParent = new Map<number, ProcNode[]>();
  for (const node of nodes) {
    byPid.set(node.pid, node);
    const siblings = childrenByParent.get(node.ppid);
    if (siblings) {
      siblings.push(node);
    } else {
      childrenByParent.set(node.ppid, [node]);
    }
  }

  const foregroundByShell = new Map<
    number,
    { leafPid: number; command: string | null }
  >();
  const cwdTargets = new Set<number>();
  for (const shellPid of shellPids) {
    const fg = findForeground(shellPid, childrenByParent, byPid);
    foregroundByShell.set(shellPid, fg);
    cwdTargets.add(fg.leafPid);
  }

  const cwds = await resolveCwds([...cwdTargets]);
  for (const shellPid of shellPids) {
    const fg = foregroundByShell.get(shellPid);
    activities.set(shellPid, {
      foregroundProcess: fg?.command ?? null,
      cwd: (fg && cwds.get(fg.leafPid)) ?? null,
    });
  }
  return activities;
}
