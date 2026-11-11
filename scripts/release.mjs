#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  gatherFacts,
  lastLineTag,
  latestAppTag,
  pendingChanges,
} from "./release/facts.mjs";
import {
  assertTagFree,
  fetchOrigin,
  git,
  pushTag,
  ROOT,
} from "./release/git.mjs";
import { RELEASE_LINES } from "./release/lines.mjs";
import { buildPlan } from "./release/plan.mjs";
import { executePlan, formatPlan } from "./release/run.mjs";
import {
  formatAppTag,
  LINE_KINDS,
  nextBetaTag,
  nextStableTag,
  parseAppTag,
} from "./release/tags.mjs";

const PACKAGE_JSON = path.join(ROOT, "apps", "desktop", "package.json");
const VERSION_FIELD = /^(\s*"version":\s*")([^"]+)(")/m;
const FLAGS = ["--dry-run", "--if-pending", "--promote", "--json"];

function releaseTag(tag, commit, { dryRun }) {
  if (dryRun) {
    assertTagFree(tag);
    console.log(
      `[dry-run] would tag ${tag} at ${commit.slice(0, 7)} and push it`,
    );
    return;
  }
  pushTag(tag, commit);
  console.log(`Pushed ${tag} at ${commit.slice(0, 7)}`);
  console.log(
    "Release workflow started. Verify with:\n" +
      "  gh run list --workflow=release.yml --limit 1\n" +
      `  gh release view ${tag} --json isDraft,isPrerelease,assets`,
  );
}

function printChanges(changes) {
  for (const change of changes) {
    const flags =
      change.signals.length > 0 ? ` [${change.signals.join(", ")}]` : "";
    console.log(`  - ${change.label} (${change.fileCount} files)${flags}`);
  }
}

function runTag(channel, kind, { dryRun, ifPending }) {
  fetchOrigin();
  const latest = latestAppTag();
  const commit = git(["rev-parse", "origin/main"]);
  if (ifPending) {
    const pending = pendingChanges(RELEASE_LINES[0], latest.tag);
    if (pending.length === 0) {
      console.log(`No app changes since ${latest.tag}; nothing to release`);
      return;
    }
    printChanges(pending);
  }
  if (git(["rev-parse", `${latest.tag}^{commit}`]) === commit) {
    throw new Error(
      `${latest.tag} already points at the origin/main tip; nothing new to release`,
    );
  }
  const tag =
    channel === "beta"
      ? nextBetaTag(latest, kind)
      : nextStableTag(latest, kind);
  releaseTag(tag, commit, { dryRun });
}

function runPromote({ dryRun }) {
  fetchOrigin();
  const latest = latestAppTag();
  if (latest.beta === null) {
    throw new Error(`${latest.tag} is already stable; cut a beta first`);
  }
  const commit = git(["rev-parse", `${latest.tag}^{commit}`]);
  console.log(`Promoting ${latest.tag} (${commit.slice(0, 7)}) unchanged`);
  releaseTag(formatAppTag({ ...latest, beta: null }), commit, { dryRun });
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

function runStatus() {
  fetchOrigin();
  for (const line of RELEASE_LINES) {
    const tag = line.name === "app" ? latestAppTag().tag : lastLineTag(line);
    const pending = pendingChanges(line, tag);
    const since = tag
      ? `${tag} (${git(["log", "-1", "--format=%cs", tag])})`
      : "never released";
    console.log(`\n${line.name}: ${line.ships}`);
    console.log(`  last tag: ${since}; workflow: ${line.workflow}`);
    if (pending.length === 0) {
      console.log("  nothing to release");
      continue;
    }
    printChanges(pending);
  }
}

function runPlan({ promote, skip, json, execute, dryRun }) {
  const plan = buildPlan(gatherFacts({ promote, skip }));
  console.log(json ? JSON.stringify(plan, null, 2) : formatPlan(plan));
  if (execute && !dryRun) {
    executePlan(plan);
  } else if (plan.blockers.length > 0) {
    process.exitCode = 1;
  }
}

function printHelp() {
  console.log(`Usage: node scripts/release.mjs <command> [options]

Commands:
  plan                   Decide what to release, what to hold and why, and the
                         order: app (iOS flows when apps/mobile changed, then
                         the next beta), web client (only when the stable app
                         serves every daemon method it calls; then deploy),
                         relay (then deploy), push gateway. Exits 1 when
                         blocked.
  run                    Build the plan and execute it step by step: push each
                         tag, wait for its workflow, verify the release, deploy
                         the web client and the relay. Stops at the first
                         failure.
  status                 For each release line, list what merged on origin/main
                         since its last tag, with risk signals.
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
  --promote              With plan or run: promote the latest beta first.
  --skip <line,...>      With plan or run: hold these lines (app, web, relay,
                         push).
  --json                 With plan or run: print the plan as JSON.
  --dry-run              Print the tag or plan; push and deploy nothing.
  --if-pending           With tag: exit quietly when no shipped app file
                         changed since the last app tag (scheduled betas).`);
}

function takeSkip(args) {
  const index = args.indexOf("--skip");
  if (index === -1) {
    return { args, skip: [] };
  }
  const skip = (args[index + 1] ?? "").split(",").filter(Boolean);
  const unknown = skip.filter(
    (line) => !RELEASE_LINES.some((l) => l.name === line),
  );
  if (skip.length === 0 || unknown.length > 0) {
    throw new Error(
      `--skip takes release lines: ${RELEASE_LINES.map((l) => l.name).join(",")}`,
    );
  }
  return { args: args.filter((_, i) => i !== index && i !== index + 1), skip };
}

function main() {
  const { args, skip } = takeSkip(process.argv.slice(2));
  const has = (flag) => args.includes(flag);
  const [command, ...rest] = args.filter((a) => !FLAGS.includes(a));
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return;
  }
  if (has("--if-pending") && command !== "tag") {
    throw new Error("--if-pending applies only to tag");
  }
  if (
    (has("--promote") || has("--json") || skip.length > 0) &&
    !["plan", "run"].includes(command)
  ) {
    throw new Error("--promote, --skip, and --json apply only to plan and run");
  }
  const dryRun = has("--dry-run");
  if (command === "tag") {
    const [channel, kind = "patch", ...extra] = rest;
    if (
      !["beta", "stable"].includes(channel) ||
      !LINE_KINDS.includes(kind) ||
      extra.length
    ) {
      throw new Error(`Usage: tag <beta|stable> [${LINE_KINDS.join("|")}]`);
    }
    runTag(channel, kind, { dryRun, ifPending: has("--if-pending") });
    return;
  }
  if (command === "stamp" && rest.length === 1) {
    runStamp(rest[0]);
    return;
  }
  if (rest.length > 0) {
    throw new Error(`${command} takes no positional argument`);
  }
  const commands = {
    status: () => runStatus(),
    promote: () => runPromote({ dryRun }),
    plan: () =>
      runPlan({
        promote: has("--promote"),
        skip,
        json: has("--json"),
        execute: false,
        dryRun,
      }),
    run: () =>
      runPlan({
        promote: has("--promote"),
        skip,
        json: has("--json"),
        execute: true,
        dryRun,
      }),
  };
  if (!commands[command]) {
    throw new Error(`Unknown command: ${command}. Use --help for usage.`);
  }
  commands[command]();
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
