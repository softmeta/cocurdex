import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

function run(command, args, { allowFailure = false } = {}) {
  try {
    return execFileSync(command, args, {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return null;
    }
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`${command} ${args.join(" ")} failed: ${detail}`);
  }
}

export function git(args, options) {
  return run("git", args, options);
}

export function gh(args, options) {
  return run("gh", args, options);
}

export function fetchOrigin() {
  git(["fetch", "--tags", "--quiet", "origin", "main"]);
}

export function assertTagFree(tag) {
  if (
    git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`], {
      allowFailure: true,
    })
  ) {
    throw new Error(`Tag ${tag} already exists locally`);
  }
  if (git(["ls-remote", "--tags", "origin", `refs/tags/${tag}`])) {
    throw new Error(`Tag ${tag} already exists on origin`);
  }
}

export function pushTag(tag, commit) {
  assertTagFree(tag);
  git(["tag", tag, commit]);
  git(["push", "origin", tag]);
}
