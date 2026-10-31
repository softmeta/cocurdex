import vm from "node:vm";
import { Worker } from "node:worker_threads";
import { Effect } from "effect";
import { SCRIPT_WORKER_SOURCE } from "./script-worker-source";

export interface ScriptHost {
  agent(prompt: string, options: Record<string, unknown>): Promise<unknown>;
  log(message: string): void;
}

export interface RunScriptOptions {
  maxListItems: number;
  maxMemoryMb?: number;
}

export class ScriptRejectedError extends Error {
  override readonly name = "ScriptRejectedError";
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

function spawnWorker(script: string, options: RunScriptOptions) {
  return Effect.acquireRelease(
    Effect.sync(
      () =>
        new Worker(SCRIPT_WORKER_SOURCE, {
          eval: true,
          workerData: { script, maxListItems: options.maxListItems },
          resourceLimits: {
            maxOldGenerationSizeMb: options.maxMemoryMb ?? 256,
          },
        }),
    ),
    (worker) => Effect.promise(() => worker.terminate()),
  );
}

function errorOf(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}

function awaitWorker(worker: Worker, host: ScriptHost) {
  return Effect.callback<unknown, Error>((resume, signal) => {
    let settled = false;
    const settle = (outcome: Effect.Effect<unknown, Error>) => {
      if (settled) return;
      settled = true;
      resume(outcome);
    };
    signal.addEventListener("abort", () => {
      settled = true;
    });

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
          message: errorOf(error).message,
        });
      }
    };

    worker.on("message", (message: WorkerMessage) => {
      if (settled) return;
      if (message.type === "agent") {
        void answerAgent(message);
      } else if (message.type === "log") {
        host.log(message.message);
      } else if (message.type === "done") {
        settle(Effect.succeed(message.result));
      } else {
        settle(Effect.fail(new Error(message.message)));
      }
    });
    worker.on("error", (error) => settle(Effect.fail(errorOf(error))));
    worker.on("exit", (code) =>
      settle(
        Effect.fail(
          new Error(`Script worker exited unexpectedly (code ${code}).`),
        ),
      ),
    );
  });
}

export function runScript(
  script: string,
  host: ScriptHost,
  options: RunScriptOptions,
): Effect.Effect<unknown, Error> {
  return Effect.try({
    try: () => validateScript(script),
    catch: errorOf,
  }).pipe(
    Effect.andThen(spawnWorker(script, options)),
    Effect.flatMap((worker) => awaitWorker(worker, host)),
    Effect.scoped,
  );
}
