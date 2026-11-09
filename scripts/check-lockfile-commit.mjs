#!/usr/bin/env node

import { execFileSync } from "node:child_process";

// biome-ignore lint/suspicious/noUndeclaredEnvVars: pre-commit hook variable, not a Turborepo task
const allowValue = process.env.COCURDEX_ALLOW_LOCKFILE_CHANGE?.toLowerCase();
const allowed =
  allowValue === "1" || allowValue === "true" || allowValue === "yes";

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function readGitFile(ref) {
  try {
    return git(["show", ref]);
  } catch {
    return undefined;
  }
}

export function extractLockfilePackages(lockfileText) {
  const packages = new Map();
  if (!lockfileText) {
    return packages;
  }

  let inPackagesSection = false;
  for (const rawLine of lockfileText.split(/\r?\n/)) {
    if (/^[A-Za-z0-9_-]+:\s*$/.test(rawLine)) {
      inPackagesSection = rawLine.trim() === "packages:";
      continue;
    }
    if (!inPackagesSection) {
      continue;
    }
    const match = /^ {2}'?([^':\r\n]+)'?:\s*$/.exec(rawLine);
    if (!match) {
      continue;
    }
    const key = match[1];
    const atIndex = key.lastIndexOf("@");
    if (atIndex <= 0) {
      continue;
    }
    const name = key.slice(0, atIndex);
    const version = key.slice(atIndex + 1);
    const versions = packages.get(name) ?? new Set();
    versions.add(version);
    packages.set(name, versions);
  }
  return packages;
}

export function summarizeLockfileChanges(beforeText, afterText) {
  const before = extractLockfilePackages(beforeText);
  const after = extractLockfilePackages(afterText);
  const allNames = new Set([...before.keys(), ...after.keys()]);
  const summary = [];

  for (const name of [...allNames].sort()) {
    const oldVersions = [...(before.get(name) ?? [])].sort();
    const newVersions = [...(after.get(name) ?? [])].sort();
    const oldKey = oldVersions.join(", ");
    const newKey = newVersions.join(", ");
    if (oldKey === newKey) {
      continue;
    }
    if (oldVersions.length === 0) {
      summary.push(`added ${name}@${newKey}`);
    } else if (newVersions.length === 0) {
      summary.push(`removed ${name}@${oldKey}`);
    } else {
      summary.push(`changed ${name} ${oldKey} -> ${newKey}`);
    }
  }
  return summary;
}

function main() {
  const stagedFiles = git(["diff", "--cached", "--name-only"])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!stagedFiles.includes("pnpm-lock.yaml")) {
    return;
  }

  if (allowed) {
    console.error(
      "pnpm-lock.yaml is staged; COCURDEX_ALLOW_LOCKFILE_CHANGE is set, allowing commit.",
    );
    return;
  }

  const beforeText = readGitFile("HEAD:pnpm-lock.yaml");
  const afterText = readGitFile(":pnpm-lock.yaml");
  const summary = summarizeLockfileChanges(beforeText, afterText);

  console.error("pnpm-lock.yaml is staged.");
  console.error("");
  console.error("Review lockfile changes before committing:");
  console.error("  - confirm every new or updated package is intentional");
  console.error(
    "  - confirm minimumReleaseAge and blockExoticSubdeps remained active",
  );
  console.error("  - review any changes to allowBuilds in pnpm-workspace.yaml");

  if (summary.length > 0) {
    console.error("");
    console.error("Detected package version changes:");
    for (const change of summary.slice(0, 40)) {
      console.error(`  - ${change}`);
    }
    if (summary.length > 40) {
      console.error(`  ... ${summary.length - 40} more`);
    }
  }

  console.error("");
  console.error("If this lockfile change is intentional, commit with:");
  console.error("  COCURDEX_ALLOW_LOCKFILE_CHANGE=1 git commit ...");
  process.exitCode = 1;
}

if (import.meta.main) {
  main();
}
