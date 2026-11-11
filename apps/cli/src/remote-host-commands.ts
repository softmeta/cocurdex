import { requestDaemon } from "@cocurdex/daemon/client";
import type { RemoteHostRecord } from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import {
  type ParsedArgs,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";

export const REMOTE_HOST_USAGE_LINES = [
  "  cocurdex host remotes list [--json]",
  "  cocurdex host remotes pair <pairing link> [--label <name for this computer>] [--json]",
  "  cocurdex host remotes workspaces <computer> [--json]",
  "  cocurdex host remotes remove <computer>",
];

const REMOTE_ACTIONS = new Set(["list", "pair", "remove", "workspaces"]);

export function isRemoteHostAction(action: string | undefined) {
  return action !== undefined && REMOTE_ACTIONS.has(action);
}

function matchHost(hosts: RemoteHostRecord[], ref: string) {
  const lower = ref.trim().toLowerCase();
  const byId = hosts.find((host) => host.hostId === ref);
  if (byId) return byId;
  const byName = hosts.filter((host) => host.name.toLowerCase() === lower);
  if (byName.length === 1) return byName[0];
  if (byName.length > 1) {
    throw new Error(`Several paired computers are named "${ref}"; pass its id`);
  }
  throw new Error(`No paired computer matches "${ref}"`);
}

async function findHost(ref: string | undefined, usage: string) {
  if (!ref) throw new Error(`Usage: ${usage}`);
  return matchHost(await requestDaemon("host.remotes.list"), ref);
}

function printPairing(
  host: RemoteHostRecord,
  missingScopes: readonly string[],
) {
  console.log(`Paired with ${host.name} (${host.hostId})`);
  console.log(`Safety code: ${host.safetyCode}`);
  if (host.status === "pending") {
    console.log(
      `On ${host.name}, approve this computer: cocurdex host approve ${host.deviceId} --code ${host.safetyCode}`,
    );
  }
  if (missingScopes.length > 0) {
    console.log(
      `To delegate work there, ${host.name} must also grant: ${missingScopes.join(", ")} (cocurdex host scopes ${host.deviceId} --scopes ...)`,
    );
  }
}

export async function handleRemoteHostCommand(
  action: string,
  args: string[],
  parsed: ParsedArgs,
) {
  if (action === "list") {
    const hosts = await withDaemon(() => requestDaemon("host.remotes.list"));
    printRows(
      hosts.map((host) => ({ ...host, scopes: host.scopes.join(",") })),
      ["hostId", "name", "status", "scopes", "safetyCode", "pairedAt"],
      parsed,
    );
    return;
  }
  if (action === "pair") {
    const link = args[0];
    if (!link) throw new Error(`Usage:\n${REMOTE_HOST_USAGE_LINES[1]}`);
    const pairing = await withDaemon(() =>
      requestDaemon("host.remotes.pair", {
        link,
        label: stringFlag(parsed, "label") ?? null,
      }),
    );
    if (parsed.flags.has("json")) {
      printResult(pairing, parsed);
      return;
    }
    printPairing(pairing.host, pairing.missingScopes);
    return;
  }
  if (action === "workspaces") {
    const catalog = await withDaemon(async () => {
      const host = await findHost(args[0], REMOTE_HOST_USAGE_LINES[2]);
      return requestDaemon("host.remotes.workspaces", { hostId: host.hostId });
    });
    printRows(catalog.workspaces, ["id", "name"], parsed);
    return;
  }
  const removed = await withDaemon(async () => {
    const host = await findHost(args[0], REMOTE_HOST_USAGE_LINES[3]);
    await requestDaemon("host.remotes.remove", { hostId: host.hostId });
    return host;
  });
  console.log(`Removed ${removed.name}`);
}
