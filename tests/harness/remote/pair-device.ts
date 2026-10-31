import { parseArgs } from "node:util";
import { createSavedHostStore, pairHost } from "@cocurdex/client-runtime";

const { values } = parseArgs({
  options: {
    url: { type: "string" },
    code: { type: "string" },
    "host-key": { type: "string" },
    label: { type: "string" },
  },
});
const { url, code, label } = values;
const hostKey = values["host-key"];
if (!url || !code || !hostKey) {
  process.stderr.write(
    "Usage: node --import tsx remote/pair-device.ts --url <origin> --code <code> --host-key <key> [--label <name>]\n",
  );
  process.exit(2);
}
const paired = await pairHost({
  baseUrl: url,
  code,
  hostKey,
  label,
  store: createSavedHostStore(null),
});
process.stdout.write(`${JSON.stringify({ deviceId: paired.deviceId })}\n`);
