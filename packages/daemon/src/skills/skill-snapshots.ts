import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { Parser, type ReadEntry } from "tar";
import type { GitTreeFile } from "./skill-files";

export interface SnapshotFile {
  path: string;
  mode: GitTreeFile["mode"];
  sha: string;
  size: number;
}

export interface GithubSnapshot {
  owner: string;
  repo: string;
  ref: string | null;
  commit: string;
  dir: string;
  files: SnapshotFile[];
}

export interface GithubArchiveOptions {
  archiveBase: string;
  apiBase: string;
  token: string | null;
  freshForMs: number;
}

interface RefRecord {
  etag: string | null;
  commit: string;
  fetchedAt: number;
}

const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 50_000;
const KEPT_COMMITS = 3;
const WINDOWS_UNSAFE_SEGMENT = /[<>:"|?*]|[. ]$/;

function hasControlCharacter(segment: string) {
  return [...segment].some((character) => character.charCodeAt(0) < 0x20);
}

export const DEFAULT_GITHUB_ARCHIVE_OPTIONS: GithubArchiveOptions = {
  archiveBase: "https://codeload.github.com",
  apiBase: "https://api.github.com",
  token: null,
  freshForMs: 60_000,
};

export function githubTokenFromEnv(env: NodeJS.ProcessEnv = process.env) {
  return env.GITHUB_TOKEN?.trim() || env.GH_TOKEN?.trim() || null;
}

export function safeArchivePath(entryPath: string): string | null {
  const segments = entryPath.replace(/\\/g, "/").split("/").filter(Boolean);
  segments.shift();
  if (segments.length === 0) {
    return null;
  }
  if (
    segments.some(
      (segment) =>
        segment === "." ||
        segment === ".." ||
        WINDOWS_UNSAFE_SEGMENT.test(segment) ||
        hasControlCharacter(segment),
    )
  ) {
    return null;
  }
  return segments.join("/");
}

function blobSha(size: number, chunks: Buffer[]) {
  const hash = createHash("sha1").update(`blob ${size}\0`);
  for (const chunk of chunks) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function exists(target: string) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

export class GithubSnapshotStore {
  private readonly inflight = new Map<string, Promise<GithubSnapshot>>();
  private readonly options: GithubArchiveOptions;

  constructor(
    private readonly cacheDir: string,
    options: Partial<GithubArchiveOptions> = {},
  ) {
    this.options = { ...DEFAULT_GITHUB_ARCHIVE_OPTIONS, ...options };
  }

  load(
    owner: string,
    repo: string,
    ref: string | null,
    options: { refresh?: boolean } = {},
  ): Promise<GithubSnapshot> {
    const key = `${owner}/${repo}#${ref ?? ""}#${options.refresh ? 1 : 0}`;
    const pending = this.inflight.get(key);
    if (pending) {
      return pending;
    }
    const next = this.loadUncached(
      owner,
      repo,
      ref,
      options.refresh ?? false,
    ).finally(() => this.inflight.delete(key));
    this.inflight.set(key, next);
    return next;
  }

  private repoDir(owner: string, repo: string) {
    return path.join(
      this.cacheDir,
      "github",
      owner.toLowerCase(),
      repo.toLowerCase(),
    );
  }

  private async readRefs(repoDir: string): Promise<Record<string, RefRecord>> {
    try {
      return JSON.parse(
        await readFile(path.join(repoDir, "refs.json"), "utf8"),
      );
    } catch {
      return {};
    }
  }

  private async readManifest(
    repoDir: string,
    commit: string,
  ): Promise<SnapshotFile[] | null> {
    try {
      const manifest = JSON.parse(
        await readFile(path.join(repoDir, `${commit}.json`), "utf8"),
      );
      return Array.isArray(manifest.files) &&
        (await exists(path.join(repoDir, commit)))
        ? manifest.files
        : null;
    } catch {
      return null;
    }
  }

  private archiveRequest(owner: string, repo: string, ref: string | null) {
    const { token, apiBase, archiveBase } = this.options;
    const headers: Record<string, string> = { "user-agent": "cocurdex" };
    if (token) {
      headers.authorization = `Bearer ${token}`;
      const suffix = ref ? `/${encodeURIComponent(ref)}` : "";
      return {
        url: `${apiBase}/repos/${owner}/${repo}/tarball${suffix}`,
        headers,
      };
    }
    const target = ref ? encodeURIComponent(ref) : "HEAD";
    return { url: `${archiveBase}/${owner}/${repo}/tar.gz/${target}`, headers };
  }

  private async loadUncached(
    owner: string,
    repo: string,
    ref: string | null,
    refresh: boolean,
  ): Promise<GithubSnapshot> {
    const repoDir = this.repoDir(owner, repo);
    const refKey = ref ?? "HEAD";
    const refs = await this.readRefs(repoDir);
    const known = refs[refKey];
    if (
      known &&
      !refresh &&
      Date.now() - known.fetchedAt < this.options.freshForMs
    ) {
      const files = await this.readManifest(repoDir, known.commit);
      if (files) {
        return this.snapshot(owner, repo, ref, known.commit, repoDir, files);
      }
    }
    const request = this.archiveRequest(owner, repo, ref);
    const knownFiles = known
      ? await this.readManifest(repoDir, known.commit)
      : null;
    if (known?.etag && knownFiles) {
      request.headers["if-none-match"] = known.etag;
    }
    const response = await fetch(request.url, {
      headers: request.headers,
      signal: AbortSignal.timeout(120_000),
    });
    if (response.status === 304 && known && knownFiles) {
      await response.body?.cancel();
      await this.writeRefs(repoDir, {
        ...refs,
        [refKey]: { ...known, fetchedAt: Date.now() },
      });
      return this.snapshot(owner, repo, ref, known.commit, repoDir, knownFiles);
    }
    if (response.status === 404) {
      await response.body?.cancel();
      throw new Error(
        `GitHub repository ${owner}/${repo}${ref ? ` at ${ref}` : ""} was not found. Private repositories need GITHUB_TOKEN.`,
      );
    }
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      throw new Error(`GitHub download failed with ${response.status}`);
    }
    const extracted = await this.extract(
      repoDir,
      Readable.fromWeb(response.body as never),
    );
    await this.writeRefs(repoDir, {
      ...refs,
      [refKey]: {
        etag: response.headers.get("etag"),
        commit: extracted.commit,
        fetchedAt: Date.now(),
      },
    });
    await this.prune(repoDir, extracted.commit);
    return this.snapshot(
      owner,
      repo,
      ref,
      extracted.commit,
      repoDir,
      extracted.files,
    );
  }

  private snapshot(
    owner: string,
    repo: string,
    ref: string | null,
    commit: string,
    repoDir: string,
    files: SnapshotFile[],
  ): GithubSnapshot {
    return { owner, repo, ref, commit, dir: path.join(repoDir, commit), files };
  }

  private async writeRefs(repoDir: string, refs: Record<string, RefRecord>) {
    await mkdir(repoDir, { recursive: true });
    await writeFile(
      path.join(repoDir, "refs.json"),
      JSON.stringify(refs),
      "utf8",
    );
  }

  async extract(
    repoDir: string,
    archive: Readable,
  ): Promise<{ commit: string; files: SnapshotFile[] }> {
    const tempDir = path.join(repoDir, `.tmp-${randomUUID()}`);
    await mkdir(tempDir, { recursive: true });
    const files: SnapshotFile[] = [];
    let commit: string | null = null;
    let totalBytes = 0;
    let entryCount = 0;
    let failure: Error | null = null;
    let writes: Promise<void> = Promise.resolve();
    const parser = new Parser({
      strict: false,
      onReadEntry: (entry: ReadEntry) => {
        entryCount += 1;
        const comment = (entry as ReadEntry & { comment?: string }).comment;
        if (!commit && comment && COMMIT_PATTERN.test(comment)) {
          commit = comment;
        }
        const relativePath = safeArchivePath(entry.path);
        if (entryCount > MAX_ARCHIVE_ENTRIES) {
          failure ??= new Error("Repository archive has too many files");
        }
        if (failure || !relativePath) {
          entry.resume();
          return;
        }
        if (entry.type === "SymbolicLink") {
          const target = Buffer.from(entry.linkpath ?? "");
          files.push({
            path: relativePath,
            mode: "120000",
            sha: blobSha(target.length, [target]),
            size: target.length,
          });
          entry.resume();
          return;
        }
        if (entry.type !== "File" && entry.type !== "OldFile") {
          entry.resume();
          return;
        }
        const chunks: Buffer[] = [];
        entry.on("data", (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > MAX_ARCHIVE_BYTES) {
            failure ??= new Error("Repository archive is too large");
            return;
          }
          chunks.push(chunk);
        });
        entry.on("end", () => {
          if (failure) {
            return;
          }
          const executable = ((entry.mode ?? 0) & 0o111) !== 0;
          const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
          files.push({
            path: relativePath,
            mode: executable ? "100755" : "100644",
            sha: blobSha(size, chunks),
            size,
          });
          const target = path.join(tempDir, ...relativePath.split("/"));
          writes = writes.then(async () => {
            await mkdir(path.dirname(target), { recursive: true });
            await writeFile(target, Buffer.concat(chunks), {
              mode: executable ? 0o755 : 0o644,
            });
          });
        });
      },
    });
    try {
      await pipeline(archive, createGunzip(), parser);
      await writes;
      if (failure) {
        throw failure;
      }
      if (!commit) {
        throw new Error("Repository archive did not include a commit");
      }
      const finalDir = path.join(repoDir, commit);
      if (await exists(finalDir)) {
        await rm(tempDir, { recursive: true, force: true });
      } else {
        await rename(tempDir, finalDir);
      }
      const sorted = files.sort((left, right) =>
        left.path.localeCompare(right.path),
      );
      await writeFile(
        path.join(repoDir, `${commit}.json`),
        JSON.stringify({ commit, files: sorted }),
        "utf8",
      );
      return { commit, files: sorted };
    } catch (error) {
      await rm(tempDir, { recursive: true, force: true });
      throw error;
    }
  }

  private async prune(repoDir: string, keep: string) {
    const entries = await readdir(repoDir, { withFileTypes: true }).catch(
      () => [],
    );
    const commits = await Promise.all(
      entries
        .filter(
          (entry) => entry.isDirectory() && COMMIT_PATTERN.test(entry.name),
        )
        .map(async (entry) => ({
          name: entry.name,
          mtime: (await stat(path.join(repoDir, entry.name))).mtimeMs,
        })),
    );
    const stale = commits
      .filter((commit) => commit.name !== keep)
      .sort((left, right) => right.mtime - left.mtime)
      .slice(KEPT_COMMITS - 1);
    for (const commit of stale) {
      await rm(path.join(repoDir, commit.name), {
        recursive: true,
        force: true,
      });
      await rm(path.join(repoDir, `${commit.name}.json`), { force: true });
    }
  }
}
