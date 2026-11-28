import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  AI_MEMORY_DEFAULT_SERVER_URL,
  type MemoryEntry,
  type MemoryImportance,
  type MemoryProviderCapabilities,
  type MemoryRecallItem,
  type MemoryRememberInput,
  type MemoryRememberResult,
  type MemoryUpdateInput,
  ReasonError,
} from "@cocurdex/shared";
import type {
  MemoryProvider,
  MemoryProviderListInput,
  MemoryProviderRecallInput,
  MemoryTransferEntry,
} from "../provider";

// ai-memory (github.com/akitaonrails/ai-memory) keeps a wiki of Markdown pages
// per workspace and project. Cocurdex writes into one project of its own; a
// page's path is its id there, and the memory's fields that a page has no
// place for travel in a trailing HTML comment.
export const AI_MEMORY_WORKSPACE = "cocurdex";
export const AI_MEMORY_PROJECT = "memory";
const SHARED_FOLDER = "shared";
const META_PATTERN = /\n*<!-- cocurdex-memory (\{.*\}) -->\s*$/s;
const REQUEST_TIMEOUT_MS = 15_000;
const READ_CONCURRENCY = 8;

const CAPABILITIES: MemoryProviderCapabilities = {
  partitions: true,
  list: true,
  update: true,
  forget: true,
  restore: false,
  history: false,
  revision: true,
  export: false,
  import: false,
};

interface PageMeta {
  kind?: string | null;
  importance?: MemoryImportance;
  project?: string | null;
  parentId?: string | null;
  supersedes?: string[];
  supersededBy?: string | null;
  seeAlso?: string[];
  device?: string | null;
  createdAt?: string | null;
}

interface PageSummary {
  path: string;
  title: string;
  updated_at?: string;
}

interface Page extends PageSummary {
  created_at?: string;
  body_markdown?: string;
  frontmatter?: { tags?: unknown };
}

interface QueryHit {
  path: string;
  title: string;
  rank?: number;
}

/**
 * Where ai-memory keeps its data: `dirs::data_local_dir()/ai-memory`, unless
 * `AI_MEMORY_DATA_DIR` moves it.
 */
export function aiMemoryDataDir(input: {
  platform: string;
  env: NodeJS.ProcessEnv;
  homeDir: string;
}) {
  const explicit = input.env.AI_MEMORY_DATA_DIR?.trim();
  if (explicit) return explicit;
  if (input.platform === "win32") {
    const local =
      input.env.LOCALAPPDATA?.trim() ||
      path.win32.join(input.homeDir, "AppData", "Local");
    return path.win32.join(local, "ai-memory");
  }
  if (input.platform === "darwin") {
    return path.posix.join(
      input.homeDir,
      "Library",
      "Application Support",
      "ai-memory",
    );
  }
  const xdg = input.env.XDG_DATA_HOME?.trim();
  return path.posix.join(
    xdg && path.posix.isAbsolute(xdg)
      ? xdg
      : path.posix.join(input.homeDir, ".local", "share"),
    "ai-memory",
  );
}

function folderFor(project: string | null) {
  if (!project) return SHARED_FOLDER;
  return project
    .split("/")
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, "-"))
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

function singleLine(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

export function renderAiMemoryPage(input: {
  title: string;
  content: string;
  meta: PageMeta;
}) {
  return `# ${singleLine(input.title)}\n\n${input.content.trim()}\n\n<!-- cocurdex-memory ${JSON.stringify(input.meta)} -->\n`;
}

function parseMeta(raw: string | undefined): PageMeta {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as PageMeta) : {};
  } catch {
    return {};
  }
}

export function parseAiMemoryPage(page: Page): MemoryTransferEntry {
  let body = page.body_markdown ?? "";
  const match = META_PATTERN.exec(body);
  const meta = parseMeta(match?.[1]);
  if (match) body = body.slice(0, match.index);
  body = body.replace(/^\s*# [^\n]*\n?/, "").trim();
  const tags = Array.isArray(page.frontmatter?.tags)
    ? page.frontmatter.tags.filter(
        (tag): tag is string => typeof tag === "string",
      )
    : [];
  const list = (value: unknown) =>
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  return {
    id: page.path,
    title: page.title,
    content: body,
    kind: typeof meta.kind === "string" ? meta.kind : null,
    importance: meta.importance === "important" ? "important" : "trivial",
    tags,
    project: typeof meta.project === "string" ? meta.project : null,
    parentId: typeof meta.parentId === "string" ? meta.parentId : null,
    supersedes: list(meta.supersedes),
    supersededBy:
      typeof meta.supersededBy === "string" ? meta.supersededBy : null,
    seeAlso: list(meta.seeAlso),
    createdAt:
      typeof meta.createdAt === "string"
        ? meta.createdAt
        : (page.created_at ?? null),
    updatedAt: page.updated_at ?? null,
    device: typeof meta.device === "string" ? meta.device : null,
  };
}

function metaOf(entry: MemoryTransferEntry): PageMeta {
  return {
    kind: entry.kind,
    importance: entry.importance,
    project: entry.project,
    parentId: entry.parentId,
    supersedes: entry.supersedes,
    supersededBy: entry.supersededBy,
    seeAlso: entry.seeAlso,
    device: entry.device,
    createdAt: entry.createdAt,
  };
}

// memory_query takes an FTS5 expression; words are quoted so punctuation in
// a recall query cannot break its syntax.
export function aiMemoryQuery(text: string) {
  const words = text
    .split(/\s+/)
    .map((word) => word.replace(/"/g, ""))
    .filter(Boolean);
  return words.map((word) => `"${word}"`).join(" OR ");
}

function toEntry(entry: MemoryTransferEntry): MemoryEntry {
  return {
    id: entry.id,
    title: entry.title,
    content: entry.content,
    importance: entry.importance,
    kind: entry.kind,
    project: entry.project,
    tags: entry.tags,
    parentId: entry.parentId,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    device: entry.device,
  };
}

async function mapLimited<T, R>(
  items: readonly T[],
  limit: number,
  run: (item: T) => Promise<R>,
) {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await run(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return results;
}

export interface AiMemoryLibraryOptions {
  serverUrl(): string | null;
  dataDir(): string;
  env: NodeJS.ProcessEnv;
  device: string;
  now(): Date;
}

export class AiMemoryLibrary implements MemoryProvider {
  readonly id = "ai-memory";
  private requestId = 0;

  constructor(private readonly options: AiMemoryLibraryOptions) {}

  serverUrl() {
    return this.options.serverUrl() ?? AI_MEMORY_DEFAULT_SERVER_URL;
  }

  tokenFile() {
    return path.join(this.options.dataDir(), "auth-tokens", "default");
  }

  // Read on every call, so a token the user rotates applies at once and none
  // is ever copied into Cocurdex's own settings.
  private async token() {
    const fromEnv = this.options.env.AI_MEMORY_AUTH_TOKEN?.trim();
    if (fromEnv) return fromEnv;
    const text = await readFile(this.tokenFile(), "utf8").catch(() => null);
    const token = text?.trim();
    if (!token) {
      throw new ReasonError(
        "memory.providerUnavailable",
        `No ai-memory token at ${this.tokenFile()}. Run: ai-memory init`,
      );
    }
    return token;
  }

  private async request(
    pathname: string,
    init: RequestInit = {},
    timeoutMs = REQUEST_TIMEOUT_MS,
  ) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await this.token()}`);
    headers.set("Accept", "application/json, text/event-stream");
    try {
      return await fetch(`${this.serverUrl()}${pathname}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new ReasonError(
        "memory.providerUnavailable",
        `ai-memory is not answering at ${this.serverUrl()}. Start it with: ai-memory serve --transport http, or set it up with: ai-memory setup`,
        { cause: error },
      );
    }
  }

  private async rest<T>(pathname: string, timeoutMs?: number) {
    const response = await this.request(pathname, {}, timeoutMs);
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new ReasonError(
        "memory.providerFailed",
        `ai-memory answered ${response.status} for ${pathname}`,
      );
    }
    return (await response.json()) as T;
  }

  private async tool<T>(
    name: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ) {
    const response = await this.request(
      "/mcp",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++this.requestId,
          method: "tools/call",
          params: {
            name,
            arguments: {
              workspace: AI_MEMORY_WORKSPACE,
              project: AI_MEMORY_PROJECT,
              ...args,
            },
          },
        }),
      },
      timeoutMs,
    );
    if (!response.ok) {
      throw new ReasonError(
        "memory.providerFailed",
        `ai-memory answered ${response.status} to ${name}`,
      );
    }
    const reply = (await response.json()) as {
      error?: { message?: string };
      result?: { isError?: boolean; content?: { text?: string }[] };
    };
    const text = reply.result?.content?.map((part) => part.text ?? "").join("");
    if (reply.error || reply.result?.isError) {
      throw new ReasonError(
        "memory.providerFailed",
        `ai-memory refused ${name}: ${reply.error?.message ?? text ?? "unknown error"}`,
      );
    }
    return JSON.parse(text || "{}") as T;
  }

  private pagesPath(page?: string) {
    const base = `/api/v1/workspaces/${AI_MEMORY_WORKSPACE}/projects/${AI_MEMORY_PROJECT}/pages`;
    if (!page) return base;
    return `${base}/${page.split("/").map(encodeURIComponent).join("/")}`;
  }

  async identity(timeoutMs = 4_000) {
    return this.rest<{ version?: string }>("/identity", timeoutMs);
  }

  async available() {
    try {
      await this.identity();
      return true;
    } catch {
      return false;
    }
  }

  async capabilities() {
    return CAPABILITIES;
  }

  async policy() {
    return "";
  }

  async injectedAgents() {
    return [];
  }

  private async pages() {
    return (await this.rest<PageSummary[]>(this.pagesPath())) ?? [];
  }

  private async page(id: string, timeoutMs?: number) {
    const page = await this.rest<Page>(this.pagesPath(id), timeoutMs);
    return page ? parseAiMemoryPage(page) : null;
  }

  async recall(input: MemoryProviderRecallInput) {
    const query = aiMemoryQuery(input.query);
    if (!query) return { items: [], error: null };
    const result = await this.tool<{ hits?: QueryHit[] }>(
      "memory_query",
      {
        query,
        limit: input.limit,
        path_prefix: input.project ? `${folderFor(input.project)}/` : null,
      },
      input.timeoutMs,
    );
    const items: MemoryRecallItem[] = (result.hits ?? []).map((hit) => ({
      id: hit.path,
      title: hit.title,
      score: typeof hit.rank === "number" ? -hit.rank : null,
      importance: null,
      updatedAt: null,
    }));
    return { items, error: null };
  }

  async show(id: string, timeoutMs?: number) {
    const entry = await this.page(id, timeoutMs);
    return { entry: entry ? toEntry(entry) : null, error: null };
  }

  async list(input: MemoryProviderListInput) {
    const folder = input.project ? `${folderFor(input.project)}/` : null;
    const pages = (await this.pages())
      .filter((page) => !folder || page.path.startsWith(folder))
      .filter((page) => !input.since || (page.updated_at ?? "") >= input.since)
      .sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""))
      .slice(0, input.limit);
    const entries = await mapLimited(pages, READ_CONCURRENCY, (page) =>
      this.page(page.path),
    );
    return entries.flatMap((entry) => (entry ? [toEntry(entry)] : []));
  }

  async snapshot() {
    const pages = await this.pages();
    const entries = await mapLimited(pages, READ_CONCURRENCY, (page) =>
      this.page(page.path),
    );
    return entries.flatMap((entry) => (entry ? [entry] : []));
  }

  async revision() {
    const pages = await this.pages();
    const newest = pages
      .map((page) => page.updated_at ?? "")
      .sort()
      .at(-1);
    return `${pages.length}:${newest ?? ""}`;
  }

  private async write(
    id: string,
    entry: MemoryTransferEntry,
    createOnly: boolean,
  ) {
    await this.tool("memory_write_page", {
      path: id,
      body: renderAiMemoryPage({
        title: entry.title,
        content: entry.content,
        meta: metaOf(entry),
      }),
      tags: entry.tags,
      create_only: createOnly,
    });
  }

  async remember(input: MemoryRememberInput): Promise<MemoryRememberResult> {
    const project = input.project ?? null;
    const id = `${folderFor(project)}/${randomUUID()}.md`;
    const now = this.options.now().toISOString();
    await this.write(
      id,
      {
        id,
        title: input.title,
        content: input.content,
        kind: input.type ?? null,
        importance: input.importance ?? "trivial",
        tags: input.tags ?? [],
        project,
        parentId: input.parentId ?? null,
        supersedes: input.supersedes ?? [],
        supersededBy: null,
        seeAlso: input.seeAlso ?? [],
        createdAt: now,
        updatedAt: now,
        device: this.options.device,
      },
      true,
    );
    return {
      action: "created",
      id,
      title: input.title,
      candidates: [],
      message: null,
    };
  }

  async update(input: MemoryUpdateInput) {
    const current = await this.page(input.id);
    if (!current) {
      throw new ReasonError(
        "memory.notFound",
        `ai-memory has no page ${input.id}`,
      );
    }
    await this.write(
      input.id,
      {
        ...current,
        title: input.title ?? current.title,
        content: input.content ?? current.content,
        tags: input.tags ?? current.tags,
        importance: input.importance ?? current.importance,
      },
      false,
    );
  }

  async forget(id: string) {
    await this.tool("memory_delete_page", { path: id });
  }

  private unsupported(): never {
    throw new ReasonError(
      "memory.unsupported",
      "ai-memory keeps its own page history; restore, history, export, and import run against Cocurdex's built-in store.",
    );
  }

  async restore() {
    this.unsupported();
  }

  async history() {
    return [];
  }

  async exportTo() {
    this.unsupported();
  }

  async importFrom(): Promise<never> {
    this.unsupported();
  }
}
