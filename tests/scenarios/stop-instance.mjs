import { rm } from "node:fs/promises";
import { parseArgs } from "node:util";
import { stopIsolatedInstance } from "./lib/instance.mjs";

const { values } = parseArgs({
  options: {
    pid: { type: "string" },
    "user-data": { type: "string" },
    workspace: { type: "string" },
  },
});

if (!values.pid || !values["user-data"]) {
  console.error(
    "Usage: node tests/scenarios/stop-instance.mjs --pid <pid> --user-data <path> [--workspace <path>]",
  );
  process.exit(2);
}

await stopIsolatedInstance(Number(values.pid), values["user-data"]);
if (values.workspace) {
  await rm(values.workspace, { recursive: true, force: true });
}
