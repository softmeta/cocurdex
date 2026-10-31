import { requestDaemon } from "@cocurdex/daemon/client";
import {
  buildHostPairingLink,
  type HostAccessScope,
  type HostAddress,
  isHostAccessScope,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import {
  getRequiredFlag,
  type ParsedArgs,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";

const DEFAULT_PAIRING_SCOPES: HostAccessScope[] = [
  "read",
  "interact",
  "approvals",
];

export function hostUsageLines() {
  return [
    "  cocurdex host status [--json]",
    "  cocurdex host remote enable [--port <port>] [--keep-awake on|off] | disable [--json]",
    "  cocurdex host pair --label <name> [--scopes read,interact,approvals] [--ttl <minutes>] [--json]",
    "  cocurdex host pairings [--json] | host pairing cancel <pairing-id>",
    "  cocurdex host devices [--json] | host revoke <device-id>",
    "  cocurdex host scopes <device-id> --scopes read,interact,approvals,files.read [--json]",
    "  cocurdex host audit [--limit <n>] [--json]",
  ];
}

export function parseScopesFlag(value: string | undefined): HostAccessScope[] {
  if (!value) return DEFAULT_PAIRING_SCOPES;
  const scopes = value
    .split(",")
    .map((scope) => scope.trim())
    .filter(Boolean);
  const unknown = scopes.filter((scope) => !isHostAccessScope(scope));
  if (unknown.length > 0) {
    throw new Error(`Unknown scopes: ${unknown.join(", ")}`);
  }
  return scopes as HostAccessScope[];
}

export function buildPairingLinks(addresses: HostAddress[], code: string) {
  return addresses.map((address) => ({
    kind: address.kind,
    url: buildHostPairingLink(address.url, code),
  }));
}

function integerFlag(parsed: ParsedArgs, name: string) {
  const value = stringFlag(parsed, name);
  if (value === undefined) return undefined;
  const parsedValue = Number(value);
  if (!Number.isInteger(parsedValue)) {
    throw new Error(`--${name} must be an integer`);
  }
  return parsedValue;
}

function keepAwakeFlag(parsed: ParsedArgs) {
  const value = stringFlag(parsed, "keep-awake");
  if (value === undefined) return undefined;
  if (value === "on") return true;
  if (value === "off") return false;
  throw new Error("--keep-awake must be on or off");
}

async function setRemoteAccess(enabled: boolean, parsed: ParsedArgs) {
  const keepAwake = keepAwakeFlag(parsed);
  const status = await withDaemon(async () => {
    const current = await requestDaemon("host.remoteAccess.get");
    return requestDaemon("host.remoteAccess.set", {
      enabled,
      port: integerFlag(parsed, "port") ?? current.settings.port,
      ...(keepAwake === undefined ? {} : { keepAwake }),
    });
  });
  if (parsed.flags.has("json")) {
    printResult(status, parsed);
    return;
  }
  if (status.error) throw new Error(status.error);
  if (!status.listening) {
    console.log("Remote access is off");
    return;
  }
  console.log(`Remote access is listening on port ${status.settings.port}`);
  if (status.settings.keepAwake) {
    console.log("The desktop app keeps this computer awake while it is on.");
  }
  console.log(
    "Traffic is not encrypted. Use it on a trusted network or over Tailscale.",
  );
  for (const address of status.addresses) {
    console.log(`  ${address.kind.padEnd(9)} ${address.url}`);
  }
}

async function createPairing(parsed: ParsedArgs) {
  const ttl = integerFlag(parsed, "ttl");
  const { created, status } = await withDaemon(async () => ({
    created: await requestDaemon("host.pairing.create", {
      label: getRequiredFlag(parsed, "label"),
      scopes: parseScopesFlag(stringFlag(parsed, "scopes")),
      ...(ttl === undefined ? {} : { ttlMinutes: ttl }),
    }),
    status: await requestDaemon("host.remoteAccess.get"),
  }));
  const links = buildPairingLinks(status.addresses, created.code);
  if (parsed.flags.has("json")) {
    printResult({ ...created, links }, parsed);
    return;
  }
  console.log(`Pairing code: ${created.code}`);
  console.log(`Scopes: ${created.pairing.scopes.join(", ")}`);
  console.log(`Expires: ${created.pairing.expiresAt}`);
  if (links.length === 0) {
    console.log(
      "Remote access is off. Run `cocurdex host remote enable` to get a pairing link.",
    );
    return;
  }
  for (const link of links) console.log(`  ${link.kind.padEnd(9)} ${link.url}`);
}

export async function handleHostCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
): Promise<boolean> {
  if (action === "status") {
    const result = await withDaemon(async () => ({
      host: await requestDaemon("host.identity"),
      remoteAccess: await requestDaemon("host.remoteAccess.get"),
    }));
    printResult(result, parsed);
    return true;
  }
  if (action === "remote" && (args[0] === "enable" || args[0] === "disable")) {
    await setRemoteAccess(args[0] === "enable", parsed);
    return true;
  }
  if (action === "pair") {
    await createPairing(parsed);
    return true;
  }
  if (action === "pairings") {
    const pairings = await withDaemon(() => requestDaemon("host.pairing.list"));
    printRows(pairings, ["id", "label", "expiresAt"], parsed);
    return true;
  }
  if (action === "pairing" && args[0] === "cancel" && args[1]) {
    const pairingId = args[1];
    const cancelled = await withDaemon(() =>
      requestDaemon("host.pairing.cancel", { pairingId }),
    );
    if (!cancelled) throw new Error(`No pending pairing ${pairingId}`);
    printResult(cancelled, parsed);
    return true;
  }
  if (action === "devices") {
    const devices = await withDaemon(() => requestDaemon("host.devices.list"));
    printRows(
      devices.map((device) => ({ ...device, scopes: device.scopes.join(",") })),
      ["id", "label", "scopes", "lastSeenAt", "revokedAt"],
      parsed,
    );
    return true;
  }
  if (action === "revoke" && args[0]) {
    const deviceId = args[0];
    const revoked = await withDaemon(() =>
      requestDaemon("host.devices.revoke", { deviceId }),
    );
    if (!revoked) throw new Error(`No device ${deviceId}`);
    printResult(revoked, parsed);
    return true;
  }
  if (action === "scopes" && args[0]) {
    const deviceId = args[0];
    const scopes = parseScopesFlag(getRequiredFlag(parsed, "scopes"));
    const updated = await withDaemon(() =>
      requestDaemon("host.devices.updateScopes", { deviceId, scopes }),
    );
    if (!updated) throw new Error(`No active device ${deviceId}`);
    printResult(updated, parsed);
    return true;
  }
  if (action === "audit") {
    const limit = integerFlag(parsed, "limit");
    const entries = await withDaemon(() =>
      requestDaemon("host.audit.list", limit === undefined ? {} : { limit }),
    );
    printRows(
      entries,
      ["at", "action", "actor", "subject", "remoteAddress"],
      parsed,
    );
    return true;
  }
  return false;
}
