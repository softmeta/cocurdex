import vm from "node:vm";
import { Worker } from "node:worker_threads";
import { SCRIPT_WORKER_SOURCE } from "./script-worker-source";

export interface ScriptHost {
  agent(prompt: string, options: Record<string, unknown>): Promise<unknown>;
  log(message: string): void;
}

export interface RunScriptOptions {
  signal: AbortSignal;
  maxListItems: number;
  maxMemoryMb?: number;
}

export class ScriptRejectedError extends Error {
  override readonly name = "ScriptRejectedError";
}

export class ScriptAbortedError extends Error {
  override readonly name = "ScriptAbortedError";

  constructor(readonly reason: unknown) {
    super("Script run was aborted.");
  }
}

type WorkerMessage =
  | {
      type: "agent";
      id: number;
      prompt: string;
      options: Record<string, unknown>;
    }
  | { type: "log"; message: string }
  | { type: "done"; result: unknown }
  | { type: "error"; message: string };

const DYNAMIC_IMPORT_PATTERN = /\bimport\s*\(/;

export function validateScript(script: string) {
  if (DYNAMIC_IMPORT_PATTERN.test(script)) {
    throw new ScriptRejectedError("Scripts cannot load modules with import().");
  }
  try {
    new vm.Script(`(async () => {\n${script}\n})()`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ScriptRejectedError(`Script has a syntax error: ${message}`);
  }
}

export function runScript(
  script: string,
  host: ScriptHost,
  options: RunScriptOptions,
): Promise<unknown> {
  try {
    validateScript(script);
  } catch (error) {
    return Promise.reject(error);
  }
  if (options.signal.aborted) {
    return Promise.reject(new ScriptAbortedError(options.signal.reason));
  }

  return new Promise((resolve, reject) => {
    const worker = new Worker(SCRIPT_WORKER_SOURCE, {
      eval: true,
      workerData: { script, maxListItems: options.maxListItems },
      resourceLimits: { maxOldGenerationSizeMb: options.maxMemoryMb ?? 256 },
    });
    let settled = false;

    const settle = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      options.signal.removeEventListener("abort", onAbort);
      void worker.terminate();
      outcome();
    };

    const onAbort = () =>
      settle(() => reject(new ScriptAbortedError(options.signal.reason)));

    const answerAgent = async (
      message: Extract<WorkerMessage, { type: "agent" }>,
    ) => {
      try {
        const value = await host.agent(message.prompt, message.options);
        if (settled) return;
        worker.postMessage({
          type: "agent-result",
          id: message.id,
          value: value === undefined ? null : value,
        });
      } catch (error) {
        if (settled) return;
        worker.postMessage({
          type: "agent-error",
          id: message.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    };

    worker.on("message", (message: WorkerMessage) => {
      if (settled) return;
      if (message.type === "agent") {
        if (options.signal.aborted) return;
        void answerAgent(message);
      } else if (message.type === "log") {
        host.log(message.message);
      } else if (message.type === "done") {
        settle(() => resolve(message.result));
      } else {
        settle(() => reject(new Error(message.message)));
      }
    });
    worker.on("error", (error) => settle(() => reject(error)));
    worker.on("exit", (code) =>
      settle(() =>
        reject(new Error(`Script worker exited unexpectedly (code ${code}).`)),
      ),
    );
    options.signal.addEventListener("abort", onAbort, { once: true });
  });
}
