import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";

export interface StubLlmRequest {
  path: string;
  authorization: string | null;
  body: Record<string, unknown>;
}

export type StubLlmPlan =
  | { kind: "stream"; chunks: string[]; intervalMs?: number }
  | { kind: "hang" }
  | { kind: "fail"; status: number; message: string };

export interface StubLlmServer {
  /** OpenAI-compatible base URL, e.g. http://127.0.0.1:PORT/v1 */
  baseUrl: string;
  requests: StubLlmRequest[];
  plan: StubLlmPlan;
  /** Resolves with the next incoming request. */
  nextRequest(): Promise<StubLlmRequest>;
  close(): Promise<void>;
}

function sseChunk(delta: Record<string, unknown>, finishReason: string | null) {
  return `data: ${JSON.stringify({
    id: "chatcmpl-e2e",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: "e2e-model",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  })}\n\n`;
}

function sseUsage() {
  return `data: ${JSON.stringify({
    id: "chatcmpl-e2e",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: "e2e-model",
    choices: [],
    usage: {
      prompt_tokens: 11,
      completion_tokens: 7,
      total_tokens: 18,
    },
  })}\n\n`;
}

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

export async function startStubLlmServer(): Promise<StubLlmServer> {
  const requests: StubLlmRequest[] = [];
  const waiters: ((request: StubLlmRequest) => void)[] = [];
  let consumed = 0;
  const state: { plan: StubLlmPlan } = { plan: { kind: "hang" } };

  const server: Server = createServer((request, response) => {
    void handle(request, response).catch(() => {
      if (!response.destroyed) response.destroy();
    });
  });

  async function handle(request: IncomingMessage, response: ServerResponse) {
    const raw = await readBody(request);
    const record: StubLlmRequest = {
      path: request.url ?? "",
      authorization: request.headers.authorization ?? null,
      body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
    };
    requests.push(record);
    for (const waiter of waiters.splice(0)) waiter(record);

    const plan = state.plan;
    if (plan.kind === "fail") {
      response.writeHead(plan.status, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ error: { message: plan.message, type: "e2e" } }),
      );
      return;
    }
    if (plan.kind === "hang") {
      // Deliberately never answer: the caller exercises abort propagation.
      request.on("close", () => response.destroy());
      return;
    }

    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    response.write(sseChunk({ role: "assistant", content: "" }, null));
    for (const text of plan.chunks) {
      if (response.destroyed) return;
      response.write(sseChunk({ content: text }, null));
      if (plan.intervalMs) {
        await new Promise((resolve) => setTimeout(resolve, plan.intervalMs));
      }
    }
    if (response.destroyed) return;
    response.write(sseChunk({}, "stop"));
    response.write(sseUsage());
    response.end("data: [DONE]\n\n");
  }

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    get plan() {
      return state.plan;
    },
    set plan(plan: StubLlmPlan) {
      state.plan = plan;
    },
    nextRequest() {
      const buffered = requests[consumed];
      if (buffered) {
        consumed += 1;
        return Promise.resolve(buffered);
      }
      return new Promise((resolve) =>
        waiters.push((request) => {
          consumed += 1;
          resolve(request);
        }),
      );
    },
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}
