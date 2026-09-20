#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACKAGE_JSON = path.join(ROOT, "apps", "desktop", "package.json");
const PACKAGE_JSON_REL = path.relative(ROOT, PACKAGE_JSON);
const VERSION_FIELD = /^(\s*"version":\s*")([^"]+)(")/m;
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
const BUMP_KINDS = ["beta", "release", "patch", "minor", "major"];

function git(args, { allowFailure = false } = {}) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    if (allowFailure) {
      return null;
    }
    const detail = error.stderr?.toString().trim() || error.message;
    throw new Error(`git ${args.join(" ")} failed: ${detail}`);
  }
}

function readVersion() {
  return JSON.parse(readFileSync(PACKAGE_JSON, "utf8")).version;
}

function writeVersion(next) {
  const source = readFileSync(PACKAGE_JSON, "utf8");
  if (!VERSION_FIELD.test(source)) {
    throw new Error(`No version field in ${PACKAGE_JSON_REL}`);
  }
  writeFileSync(PACKAGE_JSON, source.replace(VERSION_FIELD, `$1${next}$3`));
}

function nextVersion(kind, version) {
  const match = SEMVER.exec(version);
  if (!match) {
    throw new Error(`Unsupported version: ${version}`);
  }
  const [, major, minor, patch, prerelease] = match;
  if (kind === "beta") {
    if (!prerelease) {
      return `${major}.${minor}.${patch}-beta.1`;
    }
    const beta = /^beta\.(\d+)$/.exec(prerelease);
    if (!beta) {
      throw new Error(`Cannot bump beta from ${version}`);
    }
    return `${major}.${minor}.${patch}-beta.${Number(beta[1]) + 1}`;
  }
  if (kind === "release") {
    if (!prerelease) {
      throw new Error(`${version} is already a release version`);
    }
    return `${major}.${minor}.${patch}`;
  }
  if (kind === "patch") {
    return `${major}.${minor}.${Number(patch) + 1}`;
  }
  if (kind === "minor") {
    return `${major}.${Number(minor) + 1}.0`;
  }
  if (kind === "major") {
    return `${Number(major) + 1}.0.0`;
  }
  throw new Error(`Unknown bump kind: ${kind}`);
}

function assertCleanTree() {
  if (git(["status", "--porcelain"])) {
    throw new Error("Working tree is not clean; commit or stash first");
  }
}

function assertNotOnMain() {
  const branch = git(["branch", "--show-current"]);
  if (!branch) {
    throw new Error("Detached HEAD; check out a branch first");
  }
  if (branch === "main") {
    throw new Error("Refusing to work on main; create a branch first");
  }
  return branch;
}

function validateTag() {
  assertCleanTree();
  git(["fetch", "--no-tags", "origin", "main"]);
  const version = readVersion();
  const tag = `v${version}`;
  const mainVersion = JSON.parse(
    git(["show", "origin/main:apps/desktop/package.json"]),
  ).version;
  if (mainVersion !== version) {
    throw new Error(
      `origin/main is at ${mainVersion}; merge the ${version} bump first`,
    );
  }
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
  return { version, tag, commit: git(["rev-parse", "origin/main"]) };
}

function runBump(kind, { dryRun }) {
  assertCleanTree();
  const branch = assertNotOnMain();
  const from = readVersion();
  const next = nextVersion(kind, from);
  if (dryRun) {
    console.log(`[dry-run] ${from} -> ${next} (branch ${branch})`);
    return;
  }
  writeVersion(next);
  git(["add", PACKAGE_JSON_REL]);
  git(["commit", "-m", `chore(desktop): bump version to ${next}`]);
  console.log(`Bumped ${from} -> ${next} on ${branch}`);
  console.log(
    "Next: push the branch, open the PR, merge, then `release.mjs tag`.",
  );
}

function runCheck() {
  const { version, tag, commit } = validateTag();
  console.log(`Ready: ${tag} -> ${commit.slice(0, 7)} (${version})`);
}

function runTag({ dryRun }) {
  const { version, tag, commit } = validateTag();
  if (dryRun) {
    console.log(`[dry-run] would create lightweight ${tag} at ${commit}`);
    console.log(`[dry-run] would push ${tag} to origin`);
    return;
  }
  git(["tag", tag, commit]);
  git(["push", "origin", tag]);
  console.log(`Pushed ${tag} at ${commit.slice(0, 7)} (${version})`);
  console.log(
    "Release workflow started. Verify with:\n" +
      `  gh run list --workflow=release.yml --limit 1\n` +
      `  gh release view ${tag} --json isDraft,isPrerelease,assets`,
  );
}

function printHelp() {
  console.log(`Usage: node scripts/release.mjs <command> [--dry-run]

Commands:
  bump <kind>   Bump apps/desktop version and commit it on the current branch.
                kind: ${BUMP_KINDS.join(" | ")}
  check         Validate readiness to tag: clean tree, version on origin/main,
                tag name free.
  tag           Tag the origin/main tip with the current version and push it.
                This is what starts the release workflow.

Options:
  --dry-run     Print what would happen; write, commit, and push nothing.`);
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const [command, argument, ...extra] = args.filter((a) => a !== "--dry-run");
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (extra.length > 0) {
    throw new Error("Invalid arguments. Use --help for usage.");
  }
  if (command === "bump") {
    if (!BUMP_KINDS.includes(argument)) {
      throw new Error(`bump requires one of: ${BUMP_KINDS.join(", ")}`);
    }
    runBump(argument, { dryRun });
    return;
  }
  if (argument) {
    throw new Error(`${command} takes no positional argument`);
  }
  if (command === "check") {
    runCheck();
    return;
  }
  if (command === "tag") {
    runTag({ dryRun });
    return;
  }
  throw new Error(`Unknown command: ${command}. Use --help for usage.`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
