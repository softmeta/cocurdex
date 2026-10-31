import { randomUUID } from "node:crypto";
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

export interface StubToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export type StubChunk = string | PromiseLike<void>;

export interface StubTurn {
  text?: StubChunk[];
  toolCalls?: StubToolCall[];
  intervalMs?: number;
}

export type StubLlmPlan =
  | { kind: "stream"; chunks: StubChunk[]; intervalMs?: number }
  | { kind: "script"; turns: StubTurn[] }
  | { kind: "hang" }
  | { kind: "fail"; status: number; message: string };

export interface StubLlmServer {
  /** OpenAI-compatible base URL, e.g. http://127.0.0.1:PORT/v1 */
  baseUrl: string;
  requests: StubLlmRequest[];
  plan: StubLlmPlan;
  /** Resolves with the next incoming request. */
  nextRequest(timeoutMs?: number): Promise<StubLlmRequest>;
  close(): Promise<void>;
}

const NEXT_REQUEST_TIMEOUT_MS = 30_000;

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
  const serverId = randomUUID();
  let toolCallCount = 0;
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

    const turn = nextTurn(plan);
    if (!turn) {
      response.writeHead(500, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ error: { message: "Stub script exhausted" } }),
      );
      return;
    }
    await streamTurn(response, turn);
  }

  function nextTurn(plan: StubLlmPlan): StubTurn | undefined {
    if (plan.kind === "stream") {
      return { text: plan.chunks, intervalMs: plan.intervalMs };
    }
    if (plan.kind === "script") return plan.turns.shift();
    return undefined;
  }

  async function streamTurn(response: ServerResponse, turn: StubTurn) {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    response.write(sseChunk({ role: "assistant", content: "" }, null));
    for (const text of turn.text ?? []) {
      if (typeof text !== "string") {
        await text;
        continue;
      }
      if (response.destroyed) return;
      response.write(sseChunk({ content: text }, null));
      if (turn.intervalMs) {
        await new Promise((resolve) => setTimeout(resolve, turn.intervalMs));
      }
    }
    if (response.destroyed) return;
    const toolCalls = turn.toolCalls ?? [];
    toolCalls.forEach((toolCall, index) => {
      toolCallCount += 1;
      response.write(
        sseChunk(
          {
            tool_calls: [
              {
                index,
                id: `call_e2e_${serverId}_${toolCallCount}`,
                type: "function",
                function: {
                  name: toolCall.name,
                  arguments: JSON.stringify(toolCall.arguments),
                },
              },
            ],
          },
          null,
        ),
      );
    });
    response.write(sseChunk({}, toolCalls.length > 0 ? "tool_calls" : "stop"));
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
    nextRequest(timeoutMs = NEXT_REQUEST_TIMEOUT_MS) {
      const buffered = requests[consumed];
      if (buffered) {
        consumed += 1;
        return Promise.resolve(buffered);
      }
      return new Promise((resolve, reject) => {
        const waiter = (request: StubLlmRequest) => {
          clearTimeout(timer);
          consumed += 1;
          resolve(request);
        };
        const timer = setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(
            new Error(
              `No LLM request within ${timeoutMs} ms (${requests.length} received)`,
            ),
          );
        }, timeoutMs);
        waiters.push(waiter);
      });
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}
