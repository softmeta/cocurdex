import { fetchOrigin, gh, git } from "./git.mjs";
import {
  fileSignals,
  lineByName,
  lineFiles,
  parseDaemonMethods,
  RELEASE_LINES,
  WEB_CLIENT_SOURCES,
} from "./lines.mjs";
import { compareAppTags, parseAppTag } from "./tags.mjs";

const METHOD_SCOPES_PATH = "packages/rpc/src/method-scopes.ts";

export function appTagsOnMain() {
  return git(["tag", "--list", "v*", "--merged", "origin/main"])
    .split("\n")
    .map(parseAppTag)
    .filter(Boolean)
    .sort(compareAppTags);
}

export function latestAppTag() {
  const tags = appTagsOnMain();
  if (tags.length === 0) {
    throw new Error("No app release tag on origin/main");
  }
  return tags[tags.length - 1];
}

function commitOf(ref) {
  return git(["rev-parse", `${ref}^{commit}`]);
}

export function lastLineTag(line) {
  return git(
    [
      "describe",
      "--tags",
      "--abbrev=0",
      "--match",
      line.tagMatch,
      "origin/main",
    ],
    { allowFailure: true },
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

export function pendingChanges(line, tag) {
  return changesSince(tag)
    .map((change) => ({ ...change, files: lineFiles(line, change.files) }))
    .filter((change) => change.files.length > 0)
    .map((change) => ({
      sha: change.sha,
      label: describeChange(change),
      fileCount: change.files.length,
      signals: fileSignals(change.files),
    }));
}

function mainCiRun(sha) {
  const out = gh([
    "run",
    "list",
    "--workflow",
    "ci.yml",
    "--branch",
    "main",
    "--event",
    "push",
    "--commit",
    sha,
    "--limit",
    "1",
    "--json",
    "status,conclusion",
  ]);
  const [run] = JSON.parse(out);
  return run ?? null;
}

function daemonMethodsAt(ref) {
  const source = git(["show", `${ref}:${METHOD_SCOPES_PATH}`], {
    allowFailure: true,
  });
  return source ? parseDaemonMethods(source) : new Set();
}

function webClientMethods(methods) {
  const patterns = [...methods].flatMap((method) => ["-e", `"${method}"`]);
  const out = git(
    [
      "grep",
      "-h",
      "-o",
      "-F",
      ...patterns,
      "origin/main",
      "--",
      ...WEB_CLIENT_SOURCES,
    ],
    { allowFailure: true },
  );
  if (!out) {
    return [];
  }
  const used = new Set(
    out.split("\n").map((row) => row.replace(/^[^"]*"/, "").replace(/"$/, "")),
  );
  return [...used].filter((method) => methods.has(method)).sort();
}

function missingMethodsAt(commits) {
  const used = webClientMethods(daemonMethodsAt("origin/main"));
  const entries = commits.filter(Boolean).map((commit) => {
    const available = daemonMethodsAt(commit);
    return [commit, used.filter((method) => !available.has(method))];
  });
  return Object.fromEntries(entries);
}

export function gatherFacts({ promote = false } = {}) {
  fetchOrigin();
  const mainSha = git(["rev-parse", "origin/main"]);
  const tags = appTagsOnMain();
  const latest = tags[tags.length - 1];
  const latestStable = [...tags].reverse().find((tag) => tag.beta === null);
  const latestCommit = commitOf(latest.tag);
  const latestStableCommit = latestStable ? commitOf(latestStable.tag) : null;
  const [relay, push] = ["relay", "push"].map((name) => {
    const line = lineByName(name);
    const last = lastLineTag(line);
    return { last, pending: pendingChanges(line, last) };
  });
  return {
    mainSha,
    promote,
    ci: mainCiRun(mainSha),
    host: {
      canRunIosFlows: process.platform === "darwin" && process.arch === "arm64",
    },
    app: {
      latest,
      latestCommit,
      latestDate: git(["log", "-1", "--format=%cs", latest.tag]),
      latestStableCommit,
      pending: pendingChanges(RELEASE_LINES[0], latest.tag),
    },
    relay: {
      ...relay,
      missingMethodsAt:
        relay.pending.length > 0
          ? missingMethodsAt([latestStableCommit, latestCommit])
          : {},
    },
    push,
  };
}
