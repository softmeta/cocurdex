import { createInterface } from "node:readline";

const SESSION_ID = "fake-session";
let openedBy = "none";
let nextClientRequestId = 1;
const pendingClientRequests = new Map();

function send(message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

function requestClient(method, params) {
  const id = `agent-${nextClientRequestId++}`;
  send({ id, method, params });
  return new Promise((resolve) => pendingClientRequests.set(id, resolve));
}

function say(text) {
  send({
    method: "session/update",
    params: {
      sessionId: SESSION_ID,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text },
      },
    },
  });
}

async function prompt(params) {
  const text = params.prompt.find((block) => block.type === "text")?.text;
  switch (text) {
    case "crash":
      process.exit(1);
      return;
    case "exit-clean":
      process.exit(0);
      return;
    case "crash-loud":
      process.stderr.write("fatal: token sk-live-ABCDEFGHIJKLMNOP rejected\n");
      process.exit(3);
      return;
    case "hang":
      return new Promise(() => {});
    case "auth":
      throw { code: -32000, message: "Authentication required" };
    case "plan": {
      const decision = await requestClient("_x.ai/exit_plan_mode", {
        sessionId: SESSION_ID,
        toolCallId: "plan-tool",
        planContent: "Ship it",
      });
      say(`plan ${decision.outcome}`);
      return { stopReason: "end_turn" };
    }
    default:
      say(`${openedBy}: ${text}`);
      return { stopReason: "end_turn" };
  }
}

const handlers = {
  initialize: () => ({
    protocolVersion: 1,
    agentCapabilities: {
      loadSession: true,
      sessionCapabilities: { resume: {} },
    },
    authMethods: [],
  }),
  "session/new": () => {
    openedBy = "new";
    return { sessionId: SESSION_ID };
  },
  "session/resume": (params) => {
    openedBy = `resume ${params.sessionId}`;
    return {};
  },
  "session/prompt": prompt,
};

createInterface({ input: process.stdin }).on("line", async (line) => {
  const message = JSON.parse(line);
  if (message.method === undefined) {
    pendingClientRequests.get(message.id)?.(message.result);
    pendingClientRequests.delete(message.id);
    return;
  }
  const handler = handlers[message.method];
  if (message.id === undefined) {
    return;
  }
  if (!handler) {
    send({
      id: message.id,
      error: { code: -32601, message: "Method not found" },
    });
    return;
  }
  try {
    send({ id: message.id, result: await handler(message.params) });
  } catch (error) {
    send({ id: message.id, error });
  }
});
