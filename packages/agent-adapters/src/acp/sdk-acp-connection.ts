import { type ChildProcess, spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { client, methods, ndJsonStream } from "@agentclientprotocol/sdk";
import { buildChildProcessEnv } from "../shared/process-env";
import type {
  AcpConnection,
  AcpConnectionFactory,
  AcpExitPlanModeRequest,
} from "./acp-connection";

const EXIT_PLAN_MODE_METHOD = "x.ai/exit_plan_mode";

// Teardown budget per connection. ACP agents run their tool commands in their
// own detached process groups (Grok Build wraps them in process-wrap's
// `ProcessSession`, i.e. setsid), so those grandchildren are unreachable from
// here: only the agent itself can reap them, and only while it is still alive
// to run its own teardown. Killing the agent outright orphans whatever command
// it was running — which then keeps holding files and raising OS permission
// prompts long after the app is gone. So close in stages: stdin EOF for a
// clean exit, then SIGTERM, then SIGKILL as a last resort.
const EOF_GRACE_MS = 3_000;
const SIGTERM_GRACE_MS = 1_500;

function hasExited(child: ChildProcess) {
  return child.exitCode !== null || child.signalCode !== null;
}

function waitForExit(child: ChildProcess, timeoutMs: number) {
  if (hasExited(child)) {
    return Promise.resolve(true);
  }

  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      child.off("close", handleClose);
      resolve(false);
    }, timeoutMs);
    const handleClose = () => {
      clearTimeout(timeout);
      resolve(true);
    };
    child.once("close", handleClose);
  });
}

function parseExitPlanModeParams(params: unknown): AcpExitPlanModeRequest {
  const raw = (params ?? {}) as Record<string, unknown>;
  const sessionId = typeof raw.sessionId === "string" ? raw.sessionId : "";
  const toolCallId = typeof raw.toolCallId === "string" ? raw.toolCallId : "";

  if (!sessionId || !toolCallId) {
    throw new Error(
      `${EXIT_PLAN_MODE_METHOD} requires sessionId and toolCallId`,
    );
  }

  return {
    sessionId,
    toolCallId,
    planContent: typeof raw.planContent === "string" ? raw.planContent : null,
  };
}

export const createSdkAcpConnection: AcpConnectionFactory = async ({
  args,
  command,
  cwd,
  extNotificationMethods,
  handlers,
}) => {
  const child = spawn(command, args, {
    cwd,
    env: buildChildProcessEnv(),
    stdio: ["pipe", "pipe", "inherit"],
  });
  if (!child.stdin || !child.stdout) {
    child.kill();
    throw new Error(`Failed to open ACP stdio pipes for ${command}`);
  }

  const stream = ndJsonStream(
    Writable.toWeb(child.stdin) as unknown as WritableStream<Uint8Array>,
    Readable.toWeb(child.stdout) as unknown as ReadableStream<Uint8Array>,
  );
  const app = client({ name: "cocurdex" })
    .onRequest(methods.client.session.requestPermission, ({ params }) =>
      handlers.requestPermission(params),
    )
    .onNotification(methods.client.session.update, ({ params }) =>
      handlers.onSessionUpdate(params),
    );
  const exitPlanMode = handlers.exitPlanMode;
  if (exitPlanMode) {
    // Registered under both names: extension methods travel with a leading
    // underscore, and peers differ on whether they strip it before dispatch.
    // An unregistered method answers -32601, which the agent reports as a
    // failed `exit_plan_mode` tool call with no approval UI anywhere.
    for (const method of [EXIT_PLAN_MODE_METHOD, `_${EXIT_PLAN_MODE_METHOD}`]) {
      app.onRequest(method, parseExitPlanModeParams, ({ params }) =>
        exitPlanMode(params),
      );
    }
  }
  const onExtNotification = handlers.onExtNotification;
  if (onExtNotification) {
    for (const method of extNotificationMethods ?? []) {
      // Same underscore ambiguity as the ext requests above: register both
      // spellings so the push lands whichever way the agent addresses it.
      for (const wireMethod of [method, `_${method}`]) {
        app.onNotification(
          wireMethod,
          (params) => params,
          () => onExtNotification(method),
        );
      }
    }
  }
  const connection = app.connect(stream);
  child.once("error", (error) => connection.close(error));
  child.once("exit", (code, signal) => {
    if (code !== 0 && !connection.signal.aborted) {
      connection.close(
        new Error(
          `${command} ACP process exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
        ),
      );
    }
  });

  return {
    initialize: (request) =>
      connection.agent.request(methods.agent.initialize, request),
    authenticate: (request) =>
      connection.agent.request(methods.agent.authenticate, request),
    newSession: (request) =>
      connection.agent.request(methods.agent.session.new, request),
    loadSession: (request) =>
      connection.agent.request(methods.agent.session.load, request),
    resumeSession: (request) =>
      connection.agent.request(methods.agent.session.resume, request),
    setSessionMode: (request) =>
      connection.agent.request(methods.agent.session.setMode, request),
    setSessionConfigOption: (request) =>
      connection.agent.request(methods.agent.session.setConfigOption, request),
    // Untyped request: the SDK's method map has no `session/set_model` yet.
    setSessionModel: (request) =>
      connection.agent.request("session/set_model", request),
    // ACP extension methods travel with a leading underscore, which the peer
    // strips before dispatching: `_x.ai/foo` arrives as ext method `x.ai/foo`.
    // The SDK's own `extNotification` omits it and sends the bare name, which
    // agents on the Rust ACP crate reject with "Method not found" (verified
    // against `grok agent stdio`), so we add the prefix here.
    extNotification: (method, params) =>
      connection.agent.notify(`_${method}`, params),
    extRequest: (method, params) =>
      connection.agent.request(`_${method}`, params),
    prompt: (request) =>
      connection.agent.request(methods.agent.session.prompt, request),
    cancel: (request) =>
      connection.agent.notify(methods.agent.session.cancel, request),
    async close() {
      connection.close();
      if (hasExited(child)) {
        return;
      }
      // Callers cancel the active turn (`session/cancel`) before disposing, so
      // the agent is already tearing its tool processes down by the time we
      // get here; these windows are what let it finish.
      if (child.stdin && !child.stdin.writableEnded) {
        child.stdin.end();
      }
      if (await waitForExit(child, EOF_GRACE_MS)) {
        return;
      }
      child.kill("SIGTERM");
      if (await waitForExit(child, SIGTERM_GRACE_MS)) {
        return;
      }
      child.kill("SIGKILL");
    },
  } satisfies AcpConnection;
};
