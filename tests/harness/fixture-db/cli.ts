import { parseArgs } from "node:util";
import { buildFixtureDb } from "./build";
import { installFixtureDb } from "./install";

const { values } = parseArgs({
  options: {
    out: { type: "string" },
    "user-data": { type: "string" },
    "workspace-parent": { type: "string" },
  },
});
const userDataPath = values["user-data"];
const workspaceParent = values["workspace-parent"];
if (values.out) {
  await buildFixtureDb(values.out);
} else if (userDataPath && workspaceParent) {
  const installed = await installFixtureDb({ userDataPath, workspaceParent });
  process.stdout.write(`${JSON.stringify(installed)}\n`);
} else {
  process.stderr.write(
    "Usage: node --import tsx fixture-db/cli.ts (--out <dir> | --user-data <dir> --workspace-parent <dir>)\n",
  );
  process.exit(2);
}
