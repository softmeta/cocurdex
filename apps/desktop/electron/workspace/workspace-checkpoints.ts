import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AgentId, MessageRecord } from "@cocurdex/shared";
import { createGitClient } from "./git-client";

const CHECKPOINT_DIR = "workspace-checkpoints";
const MAX_CAPTURED_FILE_BYTES = 1024 * 1024;
const CHECKOUT_CHUNK_SIZE = 100;
const EXCLUDED_PATH_PARTS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  "coverage",
  "target",
]);

interface StatusEntry {
  index: string;
  workTree: string;
  path: string;
}

interface CheckpointFileEntry {
  path: string;
  existed: boolean;
  contentBase64?: string;
}

interface WorkspaceCheckpoint {
  version: 1;
  agentType: AgentId;
  createdAt: string;
  files: CheckpointFileEntry[];
  messageId: string;
  repositoryRootPath: string;
  sessionId: string;
  workspaceRootPath: string;
}

let checkpointRootPath: string | null = null;

export function initializeWorkspaceCheckpoints(userDataPath: string) {
  checkpointRootPath = path.join(userDataPath, CHECKPOINT_DIR);
}

function requireCheckpointRootPath() {
  if (!checkpointRootPath) {
    throw new Error("Workspace checkpoint store is not initialized");
  }

  return checkpointRootPath;
}

function getCheckpointPath(sessionId: string, messageId: string) {
  return path.join(requireCheckpointRootPath(), sessionId, `${messageId}.json`);
}

function isExcludedPath(relativePath: string) {
  return relativePath
    .split(/[\\/]+/)
    .some((part) => EXCLUDED_PATH_PARTS.has(part));
}

function parsePorcelainStatus(output: string) {
  const entries: StatusEntry[] = [];
  const tokens = output.split("\0").filter(Boolean);

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    const status = token.slice(0, 2);
    const filePath = token.slice(3);

    if (!filePath) {
      continue;
    }

    entries.push({
      index: status[0] ?? " ",
      workTree: status[1] ?? " ",
      path: filePath,
    });

    if (status[0] === "R" || status[0] === "C") {
      index += 1;
    }
  }

  return entries.filter((entry) => !isExcludedPath(entry.path));
}

async function getRepositoryRootPath(workspaceRootPath: string) {
  const git = createGitClient(workspaceRootPath);
  const rootPath = await git.revparse(["--show-toplevel"]);
  return rootPath.trim();
}

async function getStatusEntries(repositoryRootPath: string) {
  const git = createGitClient(repositoryRootPath);
  const output = await git.raw([
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);

  return parsePorcelainStatus(output);
}

async function captureFile(
  repositoryRootPath: string,
  relativePath: string,
): Promise<CheckpointFileEntry | null> {
  const absolutePath = path.join(repositoryRootPath, relativePath);

  try {
    const fileStat = await stat(absolutePath);

    if (!fileStat.isFile() || fileStat.size > MAX_CAPTURED_FILE_BYTES) {
      return null;
    }

    const content = await readFile(absolutePath);
    return {
      path: relativePath,
      existed: true,
      contentBase64: content.toString("base64"),
    };
  } catch {
    return {
      path: relativePath,
      existed: false,
    };
  }
}

async function removePath(absolutePath: string) {
  await rm(absolutePath, { force: true, recursive: true });
}

async function restoreTrackedPaths(
  repositoryRootPath: string,
  relativePaths: string[],
) {
  const git = createGitClient(repositoryRootPath);

  for (
    let index = 0;
    index < relativePaths.length;
    index += CHECKOUT_CHUNK_SIZE
  ) {
    const chunk = relativePaths.slice(index, index + CHECKOUT_CHUNK_SIZE);

    if (chunk.length === 0) {
      continue;
    }

    await git.raw(["reset", "--", ...chunk]);
    await git.raw(["checkout", "--", ...chunk]).catch(() => undefined);
  }
}

async function writeCheckpointFile(
  repositoryRootPath: string,
  file: CheckpointFileEntry,
) {
  const absolutePath = path.join(repositoryRootPath, file.path);

  if (!file.existed || !file.contentBase64) {
    await removePath(absolutePath);
    return;
  }

  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, Buffer.from(file.contentBase64, "base64"));
}

export async function createWorkspaceCheckpoint({
  agentType,
  message,
  workspaceRootPath,
}: {
  agentType: AgentId;
  message: MessageRecord;
  workspaceRootPath: string;
}) {
  const repositoryRootPath = await getRepositoryRootPath(workspaceRootPath);
  const statusEntries = await getStatusEntries(repositoryRootPath);
  const files = (
    await Promise.all(
      statusEntries.map((entry) => captureFile(repositoryRootPath, entry.path)),
    )
  ).filter((file): file is CheckpointFileEntry => Boolean(file));
  const checkpoint: WorkspaceCheckpoint = {
    version: 1,
    agentType,
    createdAt: new Date().toISOString(),
    files,
    messageId: message.id,
    repositoryRootPath,
    sessionId: message.sessionId,
    workspaceRootPath,
  };
  const checkpointPath = getCheckpointPath(message.sessionId, message.id);

  await mkdir(path.dirname(checkpointPath), { recursive: true });
  await writeFile(checkpointPath, JSON.stringify(checkpoint), "utf8");
}

export async function getWorkspaceCheckpointStatus({
  messageId,
  sessionId,
}: {
  messageId: string;
  sessionId: string;
}) {
  try {
    await stat(getCheckpointPath(sessionId, messageId));
    return { available: true };
  } catch {
    return { available: false };
  }
}

export async function restoreWorkspaceCheckpoint({
  messageId,
  sessionId,
}: {
  messageId: string;
  sessionId: string;
}) {
  const checkpointPath = getCheckpointPath(sessionId, messageId);
  const rawCheckpoint = await readFile(checkpointPath, "utf8");
  const checkpoint = JSON.parse(rawCheckpoint) as WorkspaceCheckpoint;
  const currentEntries = await getStatusEntries(checkpoint.repositoryRootPath);
  const trackedPaths = currentEntries
    .filter((entry) => entry.index !== "?" || entry.workTree !== "?")
    .map((entry) => entry.path);
  const untrackedPaths = currentEntries
    .filter((entry) => entry.index === "?" && entry.workTree === "?")
    .map((entry) => entry.path);

  await restoreTrackedPaths(checkpoint.repositoryRootPath, trackedPaths);

  await Promise.all(
    untrackedPaths.map((relativePath) =>
      removePath(path.join(checkpoint.repositoryRootPath, relativePath)),
    ),
  );

  for (const file of checkpoint.files) {
    await writeCheckpointFile(checkpoint.repositoryRootPath, file);
  }
}
