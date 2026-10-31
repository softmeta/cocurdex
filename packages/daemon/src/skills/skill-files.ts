import { createHash } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { SkillFileEntry, SkillFileKind } from "@cocurdex/shared";
import { SKILL_FILE_NAME } from "./skill-manifest";

export interface SkillFileRecord {
  path: string;
  size: number;
  mode: number;
  modifiedAt: number;
}

const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);
const SCRIPT_EXTENSIONS = new Set([
  ".sh",
  ".bash",
  ".zsh",
  ".fish",
  ".py",
  ".js",
  ".mjs",
  ".cjs",
  ".ts",
  ".mts",
  ".cts",
  ".rb",
  ".pl",
  ".php",
  ".ps1",
  ".psm1",
  ".bat",
  ".cmd",
  ".lua",
  ".go",
  ".rs",
]);
const DOC_EXTENSIONS = new Set([".md", ".mdx", ".txt", ".rst", ".adoc"]);
const EXECUTABLE_BITS = 0o111;
const MAX_SKILL_FILES = 5000;

export function isExecutableMode(mode: number) {
  return (mode & EXECUTABLE_BITS) !== 0;
}

export function classifySkillFile(
  relativePath: string,
  executable: boolean,
): SkillFileKind {
  if (relativePath === SKILL_FILE_NAME) {
    return "skill";
  }
  const extension = path.posix.extname(relativePath).toLowerCase();
  const firstSegment = relativePath.split("/")[0];
  if (
    SCRIPT_EXTENSIONS.has(extension) ||
    executable ||
    (firstSegment === "scripts" && relativePath.includes("/"))
  ) {
    return "script";
  }
  return DOC_EXTENSIONS.has(extension) ? "doc" : "asset";
}

export function toSkillFileEntries(
  records: SkillFileRecord[],
  platform: NodeJS.Platform = process.platform,
): SkillFileEntry[] {
  return records.map((record) => ({
    path: record.path,
    size: record.size,
    kind: classifySkillFile(
      record.path,
      platform !== "win32" && isExecutableMode(record.mode),
    ),
  }));
}

export function countScripts(entries: SkillFileEntry[]) {
  return entries.filter((entry) => entry.kind === "script").length;
}

export async function listSkillFiles(
  skillDir: string,
): Promise<SkillFileRecord[]> {
  const records: SkillFileRecord[] = [];
  async function walk(dir: string, prefix: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (records.length >= MAX_SKILL_FILES) {
        return;
      }
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) {
          await walk(absolutePath, relativePath);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const stats = await lstat(absolutePath);
      records.push({
        path: relativePath,
        size: stats.size,
        mode: stats.mode,
        modifiedAt: stats.mtimeMs,
      });
    }
  }
  await walk(skillDir, "");
  return records.sort((left, right) => left.path.localeCompare(right.path));
}

export async function computeSkillContentHash(
  skillDir: string,
  records?: SkillFileRecord[],
): Promise<string> {
  const files = records ?? (await listSkillFiles(skillDir));
  const sorted = [...files].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const hash = createHash("sha256");
  for (const file of sorted) {
    hash.update(file.path);
    hash.update(await readFile(path.join(skillDir, ...file.path.split("/"))));
  }
  return hash.digest("hex");
}

export function gitBlobSha(content: Buffer) {
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}

export interface GitTreeFile {
  path: string;
  mode: "100644" | "100755" | "120000";
  sha: string;
}

interface GitTreeNode {
  files: Map<string, { mode: string; sha: string }>;
  dirs: Map<string, GitTreeNode>;
}

function emptyNode(): GitTreeNode {
  return { files: new Map(), dirs: new Map() };
}

function gitTreeSortKey(name: string, isDirectory: boolean) {
  return isDirectory ? `${name}/` : name;
}

function compareBytes(left: string, right: string) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function hashTreeNode(node: GitTreeNode): string {
  const entries = [
    ...[...node.files].map(([name, file]) => ({
      name,
      mode: file.mode,
      sha: file.sha,
      key: gitTreeSortKey(name, false),
    })),
    ...[...node.dirs].map(([name, child]) => ({
      name,
      mode: "40000",
      sha: hashTreeNode(child),
      key: gitTreeSortKey(name, true),
    })),
  ].sort((left, right) => compareBytes(left.key, right.key));
  const body = Buffer.concat(
    entries.map((entry) =>
      Buffer.concat([
        Buffer.from(`${entry.mode} ${entry.name}\0`),
        Buffer.from(entry.sha, "hex"),
      ]),
    ),
  );
  return createHash("sha1")
    .update(`tree ${body.length}\0`)
    .update(body)
    .digest("hex");
}

export function computeGitTreeSha(files: GitTreeFile[]): string {
  const root = emptyNode();
  for (const file of files) {
    const segments = file.path.split("/");
    const fileName = segments.pop();
    if (!fileName) {
      continue;
    }
    let node = root;
    for (const segment of segments) {
      let child = node.dirs.get(segment);
      if (!child) {
        child = emptyNode();
        node.dirs.set(segment, child);
      }
      node = child;
    }
    node.files.set(fileName, { mode: file.mode, sha: file.sha });
  }
  return hashTreeNode(root);
}
