import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { after, before, test } from "node:test";
import { connect, evaluate, selectTarget, waitFor } from "./cdp-client.mjs";

let inspector;
let client;

before(async () => {
  inspector = spawn(
    process.execPath,
    ["--inspect=127.0.0.1:0", "-e", "setInterval(() => {}, 1000)"],
    {
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  const url = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error("Test inspector did not start")),
      5000,
    );
    inspector.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    inspector.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Test inspector exited"));
    });
    inspector.stderr.on("data", (chunk) => {
      output += chunk.toString();
      const match = output.match(/ws:\/\/127\.0\.0\.1:\d+\/[^\s]+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
  });
  client = await connect({ webSocketDebuggerUrl: url }, 2000);
});

after(() => {
  client?.close();
  inspector?.kill();
});

test("requires an explicit target when more than one page is present", () => {
  const page = {
    type: "page",
    title: "Desktop",
    url: "http://localhost:5173/",
    webSocketDebuggerUrl: "ws://unused",
  };
  const targets = [
    { ...page, id: "one" },
    { ...page, id: "two" },
    { ...page, id: "devtools", url: "devtools://tools" },
  ];
  assert.throws(() => selectTarget(targets), /found 2/);
  assert.equal(selectTarget(targets, { target: "two" }).id, "two");
  assert.throws(() => selectTarget(targets, { target: "missing" }), /found 0/);
  assert.throws(() => selectTarget(targets, { url: page.url }), /found 2/);
});

test("reports JavaScript exceptions and CDP protocol errors", async () => {
  await assert.rejects(
    evaluate(
      client,
      '(() => { throw new Error("specific failure"); })()',
      1000,
    ),
    /specific failure/,
  );
  await assert.rejects(client.send("Missing.method"), /Missing.method/);
});

test("waits for an observable asynchronous change without repeating the action", async () => {
  await evaluate(
    client,
    "globalThis.testCount = 0; setTimeout(() => { globalThis.testCount += 1; }, 150); true",
    1000,
  );
  assert.equal(
    await waitFor(client, "globalThis.testCount === 1", 2000, 25),
    true,
  );
  assert.equal(await evaluate(client, "globalThis.testCount", 1000), 1);
});

test("bounds a never-resolving promise and remains usable afterwards", async () => {
  await assert.rejects(
    evaluate(client, "new Promise(() => {})", 100),
    /timed out/,
  );
  assert.equal(await evaluate(client, "2 + 2", 1000), 4);
  await assert.rejects(
    waitFor(client, "false", 100, 25),
    /did not become true/,
  );
});

test("rejects pending work when the connection is closed", async () => {
  const result = evaluate(client, "new Promise(() => {})", 1000);
  const rejected = assert.rejects(result, /closed/);
  inspector.kill();
  await rejected;
});
