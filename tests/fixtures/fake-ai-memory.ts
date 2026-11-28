import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";

const PAGES = "/api/v1/workspaces/cocurdex/projects/memory/pages";

export interface FakeAiMemoryPage {
  path: string;
  title: string;
  body_markdown: string;
  frontmatter: { tags: string[] };
  created_at: string;
  updated_at: string;
}

export interface FakeAiMemory {
  url: string;
  token: string;
  pages: Map<string, FakeAiMemoryPage>;
  close(): Promise<void>;
}

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

/**
 * The slice of ai-memory 3.6's HTTP surface Cocurdex uses: bearer auth,
 * `/identity`, the project's page REST routes, and the MCP page tools.
 */
export function startFakeAiMemory(
  options: { token?: string; startAt?: Date } = {},
): Promise<FakeAiMemory> {
  const token = options.token ?? "fake-ai-memory-token";
  const startAt = (options.startAt ?? new Date()).getTime();
  const pages = new Map<string, FakeAiMemoryPage>();
  let clock = 0;
  const stamp = () => new Date(startAt + 1_000 * clock++).toISOString();
  const tools: Record<string, (args: Record<string, unknown>) => unknown> = {
    memory_write_page(args) {
      const pagePath = String(args.path);
      const body = String(args.body);
      if (args.create_only && pages.has(pagePath)) {
        throw new Error("page exists");
      }
      const previous = pages.get(pagePath);
      const at = stamp();
      pages.set(pagePath, {
        path: pagePath,
        title: /^# (.*)$/m.exec(body)?.[1] ?? pagePath,
        body_markdown: body,
        frontmatter: { tags: (args.tags as string[]) ?? [] },
        created_at: previous?.created_at ?? at,
        updated_at: at,
      });
      return { page_id: pagePath, path: pagePath };
    },
    memory_delete_page(args) {
      pages.delete(String(args.path));
      return { deleted: true };
    },
    memory_query(args) {
      const words = [...String(args.query).matchAll(/"([^"]+)"/g)].map(
        (match) => match[1].toLowerCase(),
      );
      const prefix =
        typeof args.path_prefix === "string" ? args.path_prefix : "";
      const hits = [...pages.values()]
        .filter((page) => page.path.startsWith(prefix))
        .map((page) => ({
          page,
          matches: words.filter((word) =>
            page.body_markdown.toLowerCase().includes(word),
          ).length,
        }))
        .filter((hit) => hit.matches > 0)
        .map(({ page, matches }) => ({
          id: page.path,
          path: page.path,
          title: page.title,
          rank: -matches,
        }));
      return { hits };
    },
  };
  const server = createServer(async (request, response) => {
    const send = (status: number, body: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(body));
    };
    if (request.headers.authorization !== `Bearer ${token}`) {
      send(401, { error: "unauthorized" });
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/identity") {
      send(200, { version: "3.6.4" });
      return;
    }
    if (url.pathname === PAGES) {
      send(
        200,
        [...pages.values()].map(({ path, title, updated_at }) => ({
          path,
          title,
          updated_at,
        })),
      );
      return;
    }
    if (url.pathname.startsWith(`${PAGES}/`)) {
      const pagePath = decodeURIComponent(url.pathname.slice(PAGES.length + 1));
      const page = pages.get(pagePath);
      if (page) send(200, page);
      else send(404, { error: "page not found" });
      return;
    }
    if (url.pathname === "/mcp" && request.method === "POST") {
      const rpc = await readBody(request);
      const { name, arguments: args } = rpc.params;
      try {
        const result = tools[name](args);
        send(200, {
          jsonrpc: "2.0",
          id: rpc.id,
          result: { content: [{ type: "text", text: JSON.stringify(result) }] },
        });
      } catch (error) {
        send(200, {
          jsonrpc: "2.0",
          id: rpc.id,
          result: {
            isError: true,
            content: [{ type: "text", text: (error as Error).message }],
          },
        });
      }
      return;
    }
    send(404, { error: "not found" });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${port}`,
        token,
        pages,
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}
