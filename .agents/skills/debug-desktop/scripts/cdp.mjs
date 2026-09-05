#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import {
  connect,
  evaluate,
  readEndpoint,
  selectTarget,
  waitFor,
} from "./cdp-client.mjs";
import { preflight } from "./cdp-preflight.mjs";

function numberOption(value, name, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max)
    throw new Error(`${name} must be an integer from ${min} to ${max}`);
  return number;
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      port: {
        type: "string",
        default: process.env.COCURDEX_REMOTE_DEBUGGING_PORT ?? "9222",
      },
      target: { type: "string" },
      url: { type: "string" },
      timeout: { type: "string", default: "10000" },
      interval: { type: "string", default: "200" },
      api: { type: "string", multiple: true, default: [] },
      wait: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(`Usage: node cdp.mjs <targets|preflight|eval EXPR|wait EXPR|shot [PATH]>
Options: --port PORT --target ID --url EXACT_URL --timeout MS --interval MS
preflight: --api METHOD (repeatable)
eval: --wait CONDITION (action once, then poll condition)
wait: use a read-only expression; it is evaluated repeatedly.
Timeouts bound each connection, request, or condition wait (default 10000ms).
A timed-out action may still complete in the app; inspect before retrying.`);
    return;
  }
  const [command, argument, ...extra] = positionals;
  if (
    !new Set(["targets", "preflight", "eval", "wait", "shot"]).has(command) ||
    extra.length > 0
  )
    throw new Error("Invalid command. Use --help for usage.");
  if (["eval", "wait"].includes(command) && !argument)
    throw new Error(`${command} requires an expression`);
  if (["targets", "preflight"].includes(command) && argument)
    throw new Error(`${command} takes no positional argument`);
  if (values.wait && command !== "eval")
    throw new Error("--wait is only supported with eval");
  if (values.api.length > 0 && command !== "preflight")
    throw new Error("--api is only supported with preflight");
  const options = {
    ...values,
    timeout: numberOption(values.timeout, "timeout", 1, 60000),
    interval: numberOption(values.interval, "interval", 20, 5000),
  };
  const port = numberOption(values.port, "port", 1, 65535);
  const base = `http://127.0.0.1:${port}`;
  if (command === "preflight") {
    const report = await preflight(base, options);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.apiAndDaemonReady ? 0 : 1;
    return;
  }
  const targets = await readEndpoint(base, "/json/list", options.timeout);
  if (command === "targets") {
    console.log(
      JSON.stringify(
        targets.map(({ id, type, title, url }) => ({ id, type, title, url })),
        null,
        2,
      ),
    );
    return;
  }
  const target = selectTarget(targets, options);
  const client = await connect(target, options.timeout);
  try {
    if (command === "eval") {
      const result = await evaluate(client, argument, options.timeout);
      if (options.wait)
        await waitFor(client, options.wait, options.timeout, options.interval);
      console.log(
        JSON.stringify(
          { targetId: target.id, result, conditionMet: Boolean(options.wait) },
          null,
          2,
        ),
      );
    } else if (command === "wait") {
      await waitFor(client, argument, options.timeout, options.interval);
      console.log(JSON.stringify({ targetId: target.id, conditionMet: true }));
    } else {
      const result = await client.send("Page.captureScreenshot", {
        format: "png",
      });
      if (!result?.data) throw new Error("Screenshot returned no image data");
      const output = argument ?? "/tmp/cocurdex.png";
      writeFileSync(output, Buffer.from(result.data, "base64"));
      console.log(`Screenshot -> ${output}`);
    }
  } finally {
    client.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
