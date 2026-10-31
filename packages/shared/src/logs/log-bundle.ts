import type { Dirent } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { redactSensitiveText } from "./redaction";

const SUMMARY_EVENT_LIMIT = 100;
const SUMMARY_PROBLEM_LIMIT = 50;
const SESSION_DIRECTORY = "sessions";

export interface LogBundleSummary {
  eventCounts: { event: string; count: number }[];
  files: { name: string; lines: number }[];
  levelCounts: Record<string, number>;
  recentProblems: Record<string, unknown>[];
  sessions: string[];
}

async function readDirectory(directory: string): Promise<Dirent<string>[]> {
  try {
    return await fs.readdir(directory, {
      withFileTypes: true,
      encoding: "utf8",
    });
  } catch {
    return [];
  }
}

interface LogFileCandidate {
  source: string;
  target: string;
  size: number;
  mtimeMs: number;
}

export interface CopiedLogDirectory {
  copied: string[];
  omitted: number;
}

async function listLogFiles(source: string, target: string) {
  const candidates: LogFileCandidate[] = [];
  for (const entry of await readDirectory(source)) {
    if (!entry.isFile() || !entry.name.endsWith(".log")) {
      continue;
    }
    const sourcePath = path.join(source, entry.name);
    const stat = await fs.stat(sourcePath).catch(() => null);
    if (stat) {
      candidates.push({
        source: sourcePath,
        target: path.join(target, entry.name),
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    }
  }
  return candidates;
}

export async function copyLogDirectory(
  source: string,
  target: string,
  maxBytes: number,
): Promise<CopiedLogDirectory> {
  const candidates = [
    ...(await listLogFiles(source, target)),
    ...(await listLogFiles(
      path.join(source, SESSION_DIRECTORY),
      path.join(target, SESSION_DIRECTORY),
    )),
  ].sort((a, b) => b.mtimeMs - a.mtimeMs);
  const copied: string[] = [];
  let omitted = 0;
  let remainingBytes = maxBytes;
  for (const candidate of candidates) {
    if (candidate.size > remainingBytes) {
      omitted += 1;
      continue;
    }
    try {
      await fs.mkdir(path.dirname(candidate.target), { recursive: true });
      await fs.copyFile(candidate.source, candidate.target);
      copied.push(candidate.target);
      remainingBytes -= candidate.size;
    } catch {
      omitted += 1;
    }
  }
  return { copied, omitted };
}

export async function redactFilesInPlace(filePaths: readonly string[]) {
  const kept: string[] = [];
  const dropped: string[] = [];
  for (const filePath of filePaths) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const sanitized = redactSensitiveText(content);
      if (sanitized !== content) {
        await fs.writeFile(filePath, sanitized, "utf8");
      }
      kept.push(filePath);
    } catch {
      await fs.rm(filePath, { force: true }).catch(() => undefined);
      dropped.push(filePath);
    }
  }
  return { kept, dropped };
}

function parseLogLine(line: string) {
  const trimmed = line.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }
  try {
    return JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function summarizeLogFiles(
  rootDirectory: string,
  filePaths: readonly string[],
): Promise<LogBundleSummary> {
  const eventCounts = new Map<string, number>();
  const levelCounts = new Map<string, number>();
  const recentProblems: Record<string, unknown>[] = [];
  const files: { name: string; lines: number }[] = [];

  for (const filePath of filePaths) {
    if (!filePath.endsWith(".log")) {
      continue;
    }
    let content: string;
    try {
      content = await fs.readFile(filePath, "utf8");
    } catch {
      continue;
    }
    let lines = 0;
    for (const line of content.split(/\r?\n/)) {
      const entry = parseLogLine(line);
      if (!entry) {
        continue;
      }
      lines += 1;
      if (typeof entry.event === "string") {
        eventCounts.set(entry.event, (eventCounts.get(entry.event) ?? 0) + 1);
      }
      if (typeof entry.level !== "string") {
        continue;
      }
      levelCounts.set(entry.level, (levelCounts.get(entry.level) ?? 0) + 1);
      if (entry.level === "warn" || entry.level === "error") {
        recentProblems.push({
          timestamp: entry.timestamp,
          level: entry.level,
          scope: entry.scope,
          event: entry.event,
        });
        if (recentProblems.length > SUMMARY_PROBLEM_LIMIT) {
          recentProblems.shift();
        }
      }
    }
    files.push({
      name: path.relative(rootDirectory, filePath).split(path.sep).join("/"),
      lines,
    });
  }

  return {
    eventCounts: [...eventCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, SUMMARY_EVENT_LIMIT)
      .map(([event, count]) => ({ event, count })),
    files,
    levelCounts: Object.fromEntries(levelCounts),
    recentProblems,
    sessions: files
      .map((file) => file.name)
      .filter((name) => name.split("/").includes(SESSION_DIRECTORY)),
  };
}
