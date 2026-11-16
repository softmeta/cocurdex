import vm from "node:vm";
import { ReasonError } from "@cocurdex/shared";
import { CodemodeSandbox } from "@earendil-works/pi-codemode";
import { Effect } from "effect";

export interface ScriptHost {
  agent(prompt: string, options: Record<string, unknown>): Promise<unknown>;
  log(message: string): void;
}

export interface RunScriptOptions {
  maxListItems: number;
  maxMemoryMb?: number;
}

export class ScriptRejectedError extends ReasonError<
  "script.importForbidden" | "script.syntaxError"
> {
  override readonly name = "ScriptRejectedError";
}

const DYNAMIC_IMPORT_PATTERN = /\bimport\s*\(/;

export function validateScript(script: string) {
  if (DYNAMIC_IMPORT_PATTERN.test(script)) {
    throw new ScriptRejectedError(
      "script.importForbidden",
      "Scripts cannot load modules with import().",
    );
  }
  try {
    new vm.Script(`(async () => {\n${script}\n})()`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ScriptRejectedError(
      "script.syntaxError",
      `Script has a syntax error: ${message}`,
    );
  }
}

const MEGABYTE = 1024 * 1024;

function preludeOf(maxListItems: number) {
  return `
const assertList = (value, name) => {
  if (!Array.isArray(value)) throw new TypeError(name + " expects an array.");
  if (value.length > ${maxListItems}) {
    throw new RangeError(name + " accepts at most ${maxListItems} items; got " + value.length + ".");
  }
  return value;
};
const parallel = async (tasks) => {
  const list = assertList(tasks, "parallel()");
  if (list.some((task) => typeof task !== "function")) {
    throw new TypeError("parallel() expects an array of functions.");
  }
  return Promise.all(list.map((task) => task()));
};
const pipeline = async (items, fn) => {
  const list = assertList(items, "pipeline()");
  if (typeof fn !== "function") {
    throw new TypeError("pipeline() expects a function for each item.");
  }
  return Promise.all(list.map((item) => fn(item)));
};
`;
}

function formatLogValue(value: unknown) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function agentArguments(args: unknown) {
  const [prompt, options = {}] = Array.isArray(args) ? args : [];
  if (typeof prompt !== "string") {
    throw new TypeError("agent() prompt must be a string.");
  }
  if (typeof options !== "object" || options === null) {
    throw new TypeError("agent() options must be an object.");
  }
  return { prompt, options: options as Record<string, unknown> };
}

function openSandbox(host: ScriptHost, options: RunScriptOptions) {
  return Effect.acquireRelease(
    Effect.sync(
      () =>
        new CodemodeSandbox({
          globals: [
            {
              name: "agent",
              spread: true,
              execute: async (args) => {
                const { prompt, options: agentOptions } = agentArguments(args);
                return (await host.agent(prompt, agentOptions)) ?? null;
              },
            },
            {
              name: "log",
              spread: true,
              execute: (args) => {
                const values = Array.isArray(args) ? args : [];
                host.log(values.map(formatLogValue).join(" "));
                return null;
              },
            },
          ],
          timeoutMs: Number.POSITIVE_INFINITY,
          memoryLimitBytes: (options.maxMemoryMb ?? 256) * MEGABYTE,
        }),
    ),
    (sandbox) => Effect.promise(() => sandbox.close()),
  );
}

function execute(
  sandbox: CodemodeSandbox,
  script: string,
  options: RunScriptOptions,
) {
  const code = `${preludeOf(options.maxListItems)}
return await (async () => {
${script}
})();`;
  return Effect.tryPromise({
    try: (signal) => sandbox.execute(code, { signal }),
    catch: errorOf,
  }).pipe(
    Effect.flatMap((result) =>
      result.ok
        ? Effect.succeed(result.value ?? null)
        : Effect.fail(new Error(result.error.message)),
    ),
  );
}

function errorOf(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
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
    Effect.andThen(openSandbox(host, options)),
    Effect.flatMap((sandbox) => execute(sandbox, script, options)),
    Effect.scoped,
  );
}
