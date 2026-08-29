import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { logAdapterDiagnostic } from "../diagnostics";
import { buildChildProcessEnv } from "../shared";

type RequestId = number;

interface RpcRequest {
  method: string;
  id: RequestId;
  params?: unknown;
}

interface RpcNotification {
  method: string;
  params?: unknown;
}

interface RpcSuccess {
  id: RequestId;
  result: unknown;
}

interface RpcFailure {
  id: RequestId;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type RpcMessage = RpcNotification | RpcSuccess | RpcFailure | RpcRequest;

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

export interface CodexAppServerNotification {
  method: string;
  params?: unknown;
}

export interface CodexAppServerRequest {
  method: string;
  params?: unknown;
}

export interface CodexAppServerClientOptions {
  clientName: string;
  clientTitle: string;
  clientVersion: string;
  onNotification(notification: CodexAppServerNotification): void;
  onServerRequest?(request: CodexAppServerRequest): Promise<unknown> | unknown;
  onError(error: Error): void;
}

export interface ThreadStartResult {
  thread: {
    id: string;
    name?: string | null;
  };
}

export interface TurnStartResult {
  turn: {
    id: string;
    status: string;
  };
}

export interface CodexModelListResult {
  data: Array<{
    id: string;
    model: string;
    displayName: string;
    description: string;
    hidden: boolean;
    defaultReasoningEffort: string;
    supportedReasoningEfforts: Array<{
      reasoningEffort: string;
      description: string;
    }>;
    serviceTiers?: Array<{
      id: string;
      name: string;
      description: string;
    }>;
    additionalSpeedTiers?: string[];
    inputModalities?: string[];
    isDefault: boolean;
  }>;
  nextCursor: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class CodexAppServerClient {
  #nextId = 0;
  #pendingRequests = new Map<RequestId, PendingRequest>();
  #process: ChildProcessWithoutNullStreams;
  #readline: Interface;
  #ready: Promise<void>;
  #closed = false;
  #options: CodexAppServerClientOptions;

  constructor(options: CodexAppServerClientOptions) {
    this.#options = options;
    this.#process = spawn("codex", ["app-server"], {
      env: buildChildProcessEnv(process.env),
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.#readline = createInterface({ input: this.#process.stdout });
    this.#bindProcessEvents();
    this.#ready = this.#initialize();
  }

  async startThread(
    params: Record<string, unknown>,
  ): Promise<ThreadStartResult> {
    const result = await this.#request("thread/start", params);

    if (!isRecord(result) || !isRecord(result.thread)) {
      throw new Error(
        "Codex app-server returned an invalid thread/start result",
      );
    }

    return result as unknown as ThreadStartResult;
  }

  async resumeThread(
    params: Record<string, unknown>,
  ): Promise<ThreadStartResult> {
    const result = await this.#request("thread/resume", params);

    if (!isRecord(result) || !isRecord(result.thread)) {
      throw new Error(
        "Codex app-server returned an invalid thread/resume result",
      );
    }

    return result as unknown as ThreadStartResult;
  }

  async startTurn(params: Record<string, unknown>): Promise<TurnStartResult> {
    const result = await this.#request("turn/start", params);

    if (!isRecord(result) || !isRecord(result.turn)) {
      throw new Error("Codex app-server returned an invalid turn/start result");
    }

    return result as unknown as TurnStartResult;
  }

  async steerTurn(params: Record<string, unknown>): Promise<void> {
    await this.#request("turn/steer", params);
  }

  async listModels(
    params: Record<string, unknown> = {},
  ): Promise<CodexModelListResult> {
    const result = await this.#request("model/list", params);

    if (!isRecord(result) || !Array.isArray(result.data)) {
      throw new Error("Codex app-server returned an invalid model/list result");
    }

    return result as unknown as CodexModelListResult;
  }

  async interruptTurn(threadId: string, turnId: string): Promise<void> {
    await this.#request("turn/interrupt", { threadId, turnId });
  }

  async setThreadName(threadId: string, name: string): Promise<void> {
    await this.#request("thread/name/set", { threadId, name });
  }

  // Generic escape hatch for methods without a typed wrapper (account/*, …).
  async request(method: string, params?: unknown): Promise<unknown> {
    return this.#request(method, params);
  }

  async unsubscribeThread(threadId: string): Promise<void> {
    await this.#request("thread/unsubscribe", { threadId });
  }

  dispose() {
    if (this.#closed) {
      return;
    }

    this.#closed = true;
    this.#readline.close();
    this.#process.kill();
    this.#rejectPending(new Error("Codex app-server client disposed"));
  }

  async #initialize() {
    await this.#request("initialize", {
      clientInfo: {
        name: this.#options.clientName,
        title: this.#options.clientTitle,
        version: this.#options.clientVersion,
      },
      capabilities: {
        experimentalApi: true,
      },
    });
    this.#notify("initialized", {});
  }

  #bindProcessEvents() {
    this.#readline.on("line", (line) => {
      this.#handleLine(line);
    });

    this.#process.stderr.on("data", (chunk) => {
      const message = chunk.toString().trim();

      if (message) {
        logAdapterDiagnostic("info", "[CodexAppServer] stderr", {
          messageLength: message.length,
        });
      }
    });

    this.#process.on("error", (error) => {
      const normalized =
        (error as NodeJS.ErrnoException).code === "ENOENT"
          ? new Error(
              "Codex CLI not found. Install it (npm install -g @openai/codex) and make sure `codex` is on PATH.",
            )
          : error;
      this.#options.onError(normalized);
      this.#rejectPending(normalized);
    });

    this.#process.on("exit", (code, signal) => {
      if (this.#closed) {
        return;
      }

      const detail = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
      const error = new Error(`Codex app-server exited with ${detail}`);
      this.#options.onError(error);
      this.#rejectPending(error);
    });
  }

  async #request(method: string, params?: unknown): Promise<unknown> {
    if (method !== "initialize") {
      await this.#ready;
    }

    const id = this.#nextId++;
    const request: RpcRequest = { method, id, params };

    return new Promise((resolve, reject) => {
      this.#pendingRequests.set(id, { resolve, reject });
      this.#write(request);
    });
  }

  #notify(method: string, params?: unknown) {
    this.#write({ method, params });
  }

  #write(message: RpcRequest | RpcNotification | RpcSuccess | RpcFailure) {
    if (this.#closed) {
      return;
    }

    this.#process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  #handleLine(line: string) {
    let message: RpcMessage;

    try {
      message = JSON.parse(line) as RpcMessage;
    } catch (error) {
      this.#options.onError(
        new Error(`Invalid Codex app-server JSON: ${toErrorMessage(error)}`),
      );
      return;
    }

    if ("id" in message && ("result" in message || "error" in message)) {
      this.#handleResponse(message);
      return;
    }

    if ("id" in message && "method" in message) {
      this.#handleServerRequest(message);
      return;
    }

    if ("method" in message) {
      this.#options.onNotification(message);
    }
  }

  #handleResponse(message: RpcSuccess | RpcFailure) {
    const pending = this.#pendingRequests.get(message.id);

    if (!pending) {
      return;
    }

    this.#pendingRequests.delete(message.id);

    if ("error" in message) {
      pending.reject(new Error(message.error.message));
      return;
    }

    pending.resolve(message.result);
  }

  #handleServerRequest(message: RpcRequest) {
    void this.#resolveServerRequest(message);
  }

  async #resolveServerRequest(message: RpcRequest) {
    if (!this.#options.onServerRequest) {
      this.#writeUnsupportedRequest(message);
      return;
    }

    try {
      const result = await this.#options.onServerRequest({
        method: message.method,
        params: message.params,
      });
      this.#write({ id: message.id, result });
    } catch (error) {
      this.#write({
        id: message.id,
        error: {
          code: -32000,
          message: toErrorMessage(error),
        },
      });
    }
  }

  #writeUnsupportedRequest(message: RpcRequest) {
    this.#write({
      id: message.id,
      error: {
        code: -32601,
        message: `Unsupported app-server request: ${message.method}`,
      },
    });
  }

  #rejectPending(error: Error) {
    for (const pending of this.#pendingRequests.values()) {
      pending.reject(error);
    }

    this.#pendingRequests.clear();
  }
}
