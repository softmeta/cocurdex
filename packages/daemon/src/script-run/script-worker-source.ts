export const SCRIPT_WORKER_SOURCE = String.raw`
const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");

const pending = new Map();
let nextId = 0;

function toPlain(value) {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

function formatLogValue(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function assertList(value, name) {
  if (!Array.isArray(value)) throw new TypeError(name + " expects an array.");
  if (value.length > workerData.maxListItems) {
    throw new RangeError(
      name + " accepts at most " + workerData.maxListItems + " items; got " + value.length + ".",
    );
  }
  return value;
}

parentPort.on("message", (message) => {
  const call = pending.get(message.id);
  if (!call) return;
  pending.delete(message.id);
  if (message.type === "agent-result") call.resolve(message.value);
  else call.reject(new Error(message.message));
});

async function agent(prompt, options = {}) {
  if (typeof prompt !== "string") {
    throw new TypeError("agent() prompt must be a string.");
  }
  if (typeof options !== "object" || options === null) {
    throw new TypeError("agent() options must be an object.");
  }
  const id = nextId++;
  const result = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  parentPort.postMessage({ type: "agent", id, prompt, options: toPlain(options) });
  return result;
}

async function parallel(tasks) {
  const list = assertList(tasks, "parallel()");
  if (list.some((task) => typeof task !== "function")) {
    throw new TypeError("parallel() expects an array of functions.");
  }
  return Promise.all(list.map((task) => task()));
}

async function pipeline(items, fn) {
  const list = assertList(items, "pipeline()");
  if (typeof fn !== "function") {
    throw new TypeError("pipeline() expects a function for each item.");
  }
  return Promise.all(list.map((item) => fn(item)));
}

function log(...values) {
  parentPort.postMessage({ type: "log", message: values.map(formatLogValue).join(" ") });
}

const context = vm.createContext(
  { agent, parallel, pipeline, log },
  { codeGeneration: { strings: false, wasm: false } },
);

(async () => {
  try {
    const script = new vm.Script("(async () => {\n" + workerData.script + "\n})()");
    const result = await script.runInContext(context);
    parentPort.postMessage({ type: "done", result: toPlain(result) });
  } catch (error) {
    parentPort.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  }
})();
`;
