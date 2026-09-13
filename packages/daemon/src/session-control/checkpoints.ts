import { execFile } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { validateSessionId } from "@cocurdex/shared";

const execute = promisify(execFile);
const MAX_FILE_BYTES = 1024 * 1024;

interface CheckpointFile {
  path: string;
  content: string | null;
  mode: number;
}

interface Checkpoint {
  version: 2;
  sessionId: string;
  messageId: string;
  root: string;
  head: string;
  indexTree: string;
  files: CheckpointFile[];
}

interface CheckpointInput {
  sessionId: string;
  messageId: string;
  workspaceRootPath: string;
}

async function git(root: string, args: string[]) {
  const { stdout } = await execute("git", args, {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, GIT_LITERAL_PATHSPECS: "1" },
  });
  return stdout;
}

async function repositoryRoot(workspaceRootPath: string) {
  return realpath(
    (await git(workspaceRootPath, ["rev-parse", "--show-toplevel"])).trim(),
  );
}

async function changedPaths(root: string) {
  const output = await git(root, [
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=all",
  ]);
  const tokens = output.split("\0").filter(Boolean);
  const paths = new Set<string>();
  for (let i = 0; i < tokens.length; i += 1) {
    const entry = tokens[i];
    paths.add(entry.slice(3));
    if (/[RC]/.test(entry.slice(0, 2))) paths.add(tokens[++i]);
  }
  return [...paths];
}

async function safeFilePath(root: string, relativePath: string) {
  if (
    !relativePath ||
    path.isAbsolute(relativePath) ||
    relativePath.includes("\0")
  ) {
    throw new Error("Invalid checkpoint path");
  }
  const parts = relativePath.split(/[\\/]/);
  if (
    parts.some(
      (part) =>
        !part || part === "." || part === ".." || part.toLowerCase() === ".git",
    )
  ) {
    throw new Error("Invalid checkpoint path");
  }
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    const info = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (info?.isSymbolicLink())
      throw new Error("Checkpoints do not support symbolic links");
  }
  return current;
}

async function captureFile(
  root: string,
  relativePath: string,
): Promise<CheckpointFile> {
  const filePath = await safeFilePath(root, relativePath);
  const info = await lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) return { path: relativePath, content: null, mode: 0 };
  if (!info.isFile() || info.size > MAX_FILE_BYTES) {
    throw new Error("Workspace contains files that cannot be checkpointed");
  }
  return {
    path: relativePath,
    content: (await readFile(filePath)).toString("base64"),
    mode: info.mode,
  };
}

export class SessionCheckpointStore {
  constructor(private readonly userDataPath: string) {}

  private filePath(sessionId: string, messageId: string) {
    validateSessionId(sessionId);
    validateSessionId(messageId);
    return path.join(
      this.userDataPath,
      "workspace-checkpoints",
      sessionId,
      `${messageId}.json`,
    );
  }

  async capture(input: CheckpointInput) {
    const filePath = this.filePath(input.sessionId, input.messageId);
    await rm(filePath, { force: true });
    const root = await repositoryRoot(input.workspaceRootPath);
    const head = (await git(root, ["rev-parse", "HEAD"])).trim();
    const indexTree = (await git(root, ["write-tree"])).trim();
    const files = await Promise.all(
      (await changedPaths(root)).map((entry) => captureFile(root, entry)),
    );
    const checkpoint: Checkpoint = {
      version: 2,
      sessionId: input.sessionId,
      messageId: input.messageId,
      root,
      head,
      indexTree,
      files,
    };
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(checkpoint), "utf8");
  }

  private async load(input: CheckpointInput) {
    const checkpoint = JSON.parse(
      await readFile(this.filePath(input.sessionId, input.messageId), "utf8"),
    ) as Checkpoint;
    const root = await repositoryRoot(input.workspaceRootPath);
    if (
      checkpoint.version !== 2 ||
      checkpoint.sessionId !== input.sessionId ||
      checkpoint.messageId !== input.messageId ||
      checkpoint.root !== root
    ) {
      throw new Error(
        "Checkpoint does not belong to the current session workspace",
      );
    }
    if (checkpoint.head !== (await git(root, ["rev-parse", "HEAD"])).trim()) {
      throw new Error("Workspace HEAD changed since the checkpoint");
    }
    if (!/^[a-f0-9]{40,64}$/.test(checkpoint.indexTree))
      throw new Error("Invalid checkpoint index");
    await git(root, ["cat-file", "-e", `${checkpoint.indexTree}^{tree}`]);
    for (const file of checkpoint.files) {
      await safeFilePath(root, file.path);
      if (
        (file.content !== null && typeof file.content !== "string") ||
        !Number.isInteger(file.mode)
      ) {
        throw new Error("Invalid checkpoint file");
      }
    }
    return checkpoint;
  }

  async status(input: CheckpointInput) {
    try {
      await this.load(input);
      return { available: true };
    } catch {
      return { available: false };
    }
  }

  async restore(input: CheckpointInput) {
    const checkpoint = await this.load(input);
    const affected = [
      ...new Set([
        ...(await changedPaths(checkpoint.root)),
        ...checkpoint.files.map((file) => file.path),
      ]),
    ];
    await Promise.all(
      affected.map((entry) => captureFile(checkpoint.root, entry)),
    );
    const indexPaths = new Set(
      (
        await git(checkpoint.root, [
          "ls-tree",
          "-r",
          "--name-only",
          "-z",
          checkpoint.indexTree,
        ])
      )
        .split("\0")
        .filter(Boolean),
    );
    await git(checkpoint.root, ["read-tree", checkpoint.indexTree]);
    for (const entry of affected) {
      const filePath = await safeFilePath(checkpoint.root, entry);
      if (indexPaths.has(entry)) {
        await git(checkpoint.root, ["checkout-index", "--force", "--", entry]);
      } else {
        await rm(filePath, { force: true });
      }
    }
    for (const file of checkpoint.files) {
      const filePath = await safeFilePath(checkpoint.root, file.path);
      if (file.content === null) {
        await rm(filePath, { force: true });
      } else {
        await mkdir(path.dirname(filePath), { recursive: true });
        await writeFile(filePath, Buffer.from(file.content, "base64"), {
          mode: file.mode,
        });
        await chmod(filePath, file.mode);
      }
    }
  }
}
