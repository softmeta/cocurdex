#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PACKAGE_JSON = path.join(ROOT, "apps", "desktop", "package.json");
const VERSION_FIELD = /^(\s*"version":\s*")([^"]+)(")/m;
const APP_TAG = /^v(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?$/;
const LINE_KINDS = ["patch", "minor", "major"];

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

function parseAppTag(tag) {
  const match = APP_TAG.exec(tag);
  if (!match) {
    return null;
  }
  const [major, minor, patch] = match.slice(1, 4).map(Number);
  const beta = match[4] === undefined ? null : Number(match[4]);
  return { tag, major, minor, patch, beta };
}

function compareAppTags(a, b) {
  const core = a.major - b.major || a.minor - b.minor || a.patch - b.patch;
  if (core !== 0) {
    return core;
  }
  if (a.beta === b.beta) {
    return 0;
  }
  if (a.beta === null) {
    return 1;
  }
  if (b.beta === null) {
    return -1;
  }
  return a.beta - b.beta;
}

function formatAppTag({ major, minor, patch, beta }) {
  const core = `v${major}.${minor}.${patch}`;
  return beta === null ? core : `${core}-beta.${beta}`;
}

function nextLineCore(latest, kind) {
  if (kind === "major") {
    return { major: latest.major + 1, minor: 0, patch: 0 };
  }
  if (kind === "minor") {
    return { major: latest.major, minor: latest.minor + 1, patch: 0 };
  }
  return { major: latest.major, minor: latest.minor, patch: latest.patch + 1 };
}

function nextBetaTag(latest, kind) {
  if (latest.beta !== null && kind === "patch") {
    return formatAppTag({ ...latest, beta: latest.beta + 1 });
  }
  if (latest.beta !== null) {
    throw new Error(
      `${latest.tag} opens a beta line; promote it or cut another beta before a ${kind} line`,
    );
  }
  return formatAppTag({ ...nextLineCore(latest, kind), beta: 1 });
}

function nextStableTag(latest, kind) {
  if (latest.beta !== null) {
    throw new Error(
      `${latest.tag} opens a beta line; run \`promote\` to ship it as stable`,
    );
  }
  return formatAppTag({ ...nextLineCore(latest, kind), beta: null });
}

function fetchOrigin() {
  git(["fetch", "--tags", "--quiet", "origin", "main"]);
}

function latestAppTag() {
  const tags = git(["tag", "--list", "v*", "--merged", "origin/main"])
    .split("\n")
    .map(parseAppTag)
    .filter(Boolean)
    .sort(compareAppTags);
  if (tags.length === 0) {
    throw new Error("No app release tag on origin/main");
  }
  return tags[tags.length - 1];
}

function assertTagFree(tag) {
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

function pushTag(tag, commit, { dryRun }) {
  assertTagFree(tag);
  if (dryRun) {
    console.log(
      `[dry-run] would tag ${tag} at ${commit.slice(0, 7)} and push it`,
    );
    return;
  }
  git(["tag", tag, commit]);
  git(["push", "origin", tag]);
  console.log(`Pushed ${tag} at ${commit.slice(0, 7)}`);
  console.log(
    "Release workflow started. Verify with:\n" +
      "  gh run list --workflow=release.yml --limit 1\n" +
      `  gh release view ${tag} --json isDraft,isPrerelease,assets`,
  );
}

function runTag(channel, kind, { dryRun }) {
  fetchOrigin();
  const latest = latestAppTag();
  const commit = git(["rev-parse", "origin/main"]);
  if (git(["rev-parse", `${latest.tag}^{commit}`]) === commit) {
    throw new Error(
      `${latest.tag} already points at the origin/main tip; nothing new to release`,
    );
  }
  const tag =
    channel === "beta"
      ? nextBetaTag(latest, kind)
      : nextStableTag(latest, kind);
  pushTag(tag, commit, { dryRun });
}

function runPromote({ dryRun }) {
  fetchOrigin();
  const latest = latestAppTag();
  if (latest.beta === null) {
    throw new Error(`${latest.tag} is already stable; cut a beta first`);
  }
  const commit = git(["rev-parse", `${latest.tag}^{commit}`]);
  console.log(`Promoting ${latest.tag} (${commit.slice(0, 7)}) unchanged`);
  pushTag(formatAppTag({ ...latest, beta: null }), commit, { dryRun });
}

function runStamp(tag) {
  if (!parseAppTag(tag)) {
    throw new Error(`Not an app release tag: ${tag}`);
  }
  const source = readFileSync(PACKAGE_JSON, "utf8");
  if (!VERSION_FIELD.test(source)) {
    throw new Error(`No version field in ${PACKAGE_JSON}`);
  }
  writeFileSync(
    PACKAGE_JSON,
    source.replace(VERSION_FIELD, `$1${tag.slice(1)}$3`),
  );
  console.log(`Stamped apps/desktop/package.json with ${tag.slice(1)}`);
}

const RENDERER_PACKAGES = [
  "packages/client-runtime/",
  "packages/deck/",
  "packages/note-doc/",
  "packages/rpc/",
  "packages/shared/",
  "packages/secure-channel/",
];

const RELEASE_LINES = [
  {
    name: "app",
    tagMatch: "v[0-9]*",
    workflow: "release.yml",
    ships: "desktop (macOS, Windows, Linux), iOS TestFlight, Android",
    inputs: ["apps/desktop/", "apps/mobile/", "apps/cli/", "packages/"],
  },
  {
    name: "relay",
    tagMatch: "relay-v[0-9]*",
    workflow: "relay-release.yml",
    ships: "relay binaries with the desktop renderer as its web client",
    inputs: ["services/relay/", "apps/desktop/src/", ...RENDERER_PACKAGES],
  },
  {
    name: "push",
    tagMatch: "push-v[0-9]*",
    workflow: "push-release.yml",
    ships: "push gateway",
    inputs: ["services/push/"],
  },
];

const SIGNALS = [
  {
    label: "schema migration",
    match: (f) => f === "packages/db/src/migrations.ts",
  },
  {
    label: "mobile native",
    match: (f) =>
      /^apps\/mobile\/(ios|android|modules|plugins)\//.test(f) ||
      /^apps\/mobile\/(app\.json|app\.config\.js|package\.json)$/.test(f),
  },
  {
    label: "CLI or skill contract",
    match: (f) =>
      f.startsWith("apps/cli/") || f.startsWith("packages/product-skills/"),
  },
];

function isShippedFile(file) {
  if (file.endsWith(".md")) {
    return false;
  }
  return !/(^|\/)(tests?|__tests__|docs)\//.test(file);
}

function lineFiles(line, files) {
  return files.filter(
    (file) =>
      isShippedFile(file) &&
      line.inputs.some((input) => file.startsWith(input)),
  );
}

function fileSignals(files) {
  return SIGNALS.filter((signal) => files.some(signal.match)).map(
    (s) => s.label,
  );
}

function lastLineTag(line) {
  return git(
    [
      "describe",
      "--tags",
      "--abbrev=0",
      "--match",
      line.tagMatch,
      "origin/main",
    ],
    {
      allowFailure: true,
    },
  );
}

function changesSince(tag) {
  const range = tag ? `${tag}..origin/main` : "origin/main";
  const log = git(["log", "--first-parent", "--format=%H%x09%s", range]);
  if (!log) {
    return [];
  }
  return log.split("\n").map((row) => {
    const [sha, subject] = row.split("\t");
    const files = git(["diff", "--name-only", `${sha}^1`, sha], {
      allowFailure: true,
    });
    return { sha, subject, files: files ? files.split("\n") : [] };
  });
}

function describeChange({ sha, subject }) {
  const pr = /^Merge pull request #(\d+) from \S+/.exec(subject);
  const title = git(["log", "-1", "--format=%b", sha]).split("\n")[0];
  return pr ? `#${pr[1]} ${title || subject}` : `${sha.slice(0, 7)} ${subject}`;
}

function runStatus() {
  fetchOrigin();
  for (const line of RELEASE_LINES) {
    const tag = line.name === "app" ? latestAppTag().tag : lastLineTag(line);
    const pending = changesSince(tag)
      .map((change) => ({ ...change, files: lineFiles(line, change.files) }))
      .filter((change) => change.files.length > 0);
    const since = tag
      ? `${tag} (${git(["log", "-1", "--format=%cs", tag])})`
      : "never released";
    console.log(`\n${line.name}: ${line.ships}`);
    console.log(`  last tag: ${since}; workflow: ${line.workflow}`);
    if (pending.length === 0) {
      console.log("  nothing to release");
      continue;
    }
    for (const change of pending) {
      const signals = fileSignals(change.files);
      const flags = signals.length > 0 ? ` [${signals.join(", ")}]` : "";
      console.log(
        `  - ${describeChange(change)} (${change.files.length} files)${flags}`,
      );
    }
  }
}

function printHelp() {
  console.log(`Usage: node scripts/release.mjs <command> [--dry-run]

Commands:
  status                 For each release line (app, relay, push), list what
                         merged on origin/main since its last tag, with risk
                         signals.
  tag beta [kind]        Tag the origin/main tip as the next app beta: the next
                         beta.N of an open beta line, or beta.1 of a new
                         ${LINE_KINDS.join(" | ")} line (default patch).
  tag stable [kind]      Tag the origin/main tip as a new stable line without a
                         beta (default patch).
  promote                Tag the commit of the latest beta as its stable
                         version, so stable ships exactly what beta users ran.
  stamp <tag>            Write the tag's version into apps/desktop/package.json
                         (used by the Release workflow).

Options:
  --dry-run              Print the tag and commit; tag and push nothing.`);
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const [command, ...rest] = args.filter((a) => a !== "--dry-run");
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (command === "tag") {
    const [channel, kind = "patch", ...extra] = rest;
    if (
      !["beta", "stable"].includes(channel) ||
      !LINE_KINDS.includes(kind) ||
      extra.length
    ) {
      throw new Error(`Usage: tag <beta|stable> [${LINE_KINDS.join("|")}]`);
    }
    runTag(channel, kind, { dryRun });
    return;
  }
  if (command === "stamp" && rest.length === 1) {
    runStamp(rest[0]);
    return;
  }
  if (rest.length > 0) {
    throw new Error(`${command} takes no positional argument`);
  }
  if (command === "status") {
    runStatus();
    return;
  }
  if (command === "promote") {
    runPromote({ dryRun });
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
