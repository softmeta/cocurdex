import { runGit } from "./git-run";

async function checkpointHead(cwd: string, ref: string) {
  const output = await runGit(["rev-parse", "--verify", "--quiet", `${ref}^`], {
    cwd,
    allowFailure: true,
  });
  return output.trim() || null;
}

async function listPaths(cwd: string, args: string[]) {
  const output = await runGit(args, { cwd, allowFailure: true });
  return output
    .split("\0")
    .map((entry) => entry.replace(/^\n+/, ""))
    .filter(Boolean);
}

function diffPaths(cwd: string, from: string, to: string) {
  return listPaths(cwd, [
    "diff",
    "--name-only",
    "-z",
    "--no-renames",
    from,
    to,
  ]);
}

export async function pathsChangedByHeadMove(
  cwd: string,
  beforeRef: string,
  afterRef: string,
) {
  const [beforeHead, afterHead] = await Promise.all([
    checkpointHead(cwd, beforeRef),
    checkpointHead(cwd, afterRef),
  ]);
  if (!beforeHead || !afterHead || beforeHead === afterHead) {
    return new Set<string>();
  }
  const turnStart = (
    await runGit(["log", "-1", "--format=%cI", beforeRef], { cwd })
  ).trim();
  const [moved, committed, beforeLocal, afterLocal] = await Promise.all([
    diffPaths(cwd, beforeHead, afterHead),
    listPaths(cwd, [
      "log",
      "--format=",
      "--name-only",
      "-z",
      "--no-renames",
      `--since=${turnStart}`,
      `${beforeHead}..${afterHead}`,
    ]),
    diffPaths(cwd, beforeHead, beforeRef),
    diffPaths(cwd, afterHead, afterRef),
  ]);
  const authored = new Set([...committed, ...beforeLocal, ...afterLocal]);
  return new Set(moved.filter((entry) => !authored.has(entry)));
}
