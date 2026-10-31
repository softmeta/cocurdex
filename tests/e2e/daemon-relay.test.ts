import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  connectPairedHost,
  createRemoteFileClient,
  createSavedHostStore,
  createSecureHostTransport,
  HostAccessError,
  pairHost,
  type SavedHost,
  savedHostEndpoint,
} from "@cocurdex/client-runtime";
import { requestDaemon } from "@cocurdex/daemon/client";
import { createDaemonRpcClient } from "@cocurdex/rpc/client";
import {
  buildHostPairingLink,
  type HostRemoteAccessStatus,
  parseHostPairingLink,
} from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  type DaemonProcess,
  spawnDaemon,
} from "@cocurdex/test-harness/helpers/daemon-process";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./helpers/cli";
import {
  buildRelay,
  freePort,
  type RelayProcess,
  runRelayCommand,
  startRelay,
} from "./helpers/relay";

const tempDirs = createTempDirs();
let relayBinary = "";

beforeAll(async () => {
  relayBinary = await buildRelay(tempDirs.createSync("relay-bin-"));
}, 180_000);

afterAll(() => tempDirs.cleanup());

const daemons: DaemonProcess[] = [];
const relays: RelayProcess[] = [];

afterEach(async () => {
  for (const daemon of daemons.splice(0)) await daemon.dispose();
  for (const relay of relays.splice(0)) await relay.stop();
});

async function launch(
  relayArgs: string[] = [],
  relayData = tempDirs.createSync("relay-data-"),
) {
  const relay = await startRelay(relayBinary, relayData, relayArgs);
  relays.push(relay);
  const daemon = await spawnDaemon();
  daemons.push(daemon);
  await requestDaemon(
    "host.remoteAccess.set",
    { enabled: true, port: await freePort() },
    daemon.options,
  );
  return { relay, daemon };
}

async function waitForRelay(
  daemon: DaemonProcess,
  accept: (status: HostRemoteAccessStatus) => boolean,
) {
  const deadline = Date.now() + 15_000;
  for (;;) {
    const status = await requestDaemon("host.remoteAccess.get", daemon.options);
    if (accept(status)) return status;
    if (Date.now() > deadline) {
      throw new Error(`Relay never settled: ${JSON.stringify(status.relay)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

function remoteClient(host: SavedHost) {
  return createDaemonRpcClient(
    createSecureHostTransport(savedHostEndpoint(host)),
    "",
  );
}

describe("remote access through the relay", () => {
  it("pairs and serves a device only through the relay in relay-only mode", async () => {
    const { relay, daemon } = await launch();

    const set = await requestDaemon(
      "host.relay.set",
      { url: relay.url },
      daemon.options,
    );
    expect(set).toMatchObject({ listening: false, addresses: [] });
    const status = await waitForRelay(
      daemon,
      (next) => next.relay.state === "online",
    );
    const endpoint = status.relay.endpoint ?? "";
    expect(endpoint.startsWith(`${relay.url}/v1/connect/`)).toBe(true);

    const { code, hostKey } = await requestDaemon(
      "host.pairing.create",
      { label: "Phone", scopes: ["read"] },
      daemon.options,
    );
    const link = parseHostPairingLink(
      buildHostPairingLink(endpoint, code, hostKey),
    );
    expect(link?.baseUrl).toBe(endpoint);
    const paired = await pairHost({
      baseUrl: link?.baseUrl ?? "",
      code,
      hostKey,
      label: "Pixel",
      store: createSavedHostStore(null),
    });
    expect(paired.baseUrl).toBe(endpoint);
    expect(paired.endpoints).toEqual([endpoint]);

    const client = remoteClient(paired);
    await expect(
      client.request("host.session", undefined),
    ).resolves.toMatchObject({
      principal: { kind: "device", deviceId: paired.deviceId },
      endpoints: [endpoint],
    });
    const audit = await requestDaemon("host.audit.list", {}, daemon.options);
    expect(
      audit.find((entry) => entry.action === "pairing.exchanged")
        ?.remoteAddress,
    ).toBe(`relay:${new URL(relay.url).host}`);

    await requestDaemon("host.relay.set", { url: null }, daemon.options);
    const refused = await connectPairedHost(savedHostEndpoint(paired)).catch(
      (error: unknown) => error,
    );
    expect(refused).toBeInstanceOf(HostAccessError);
    expect(refused).toMatchObject({ reason: "unreachable" });
  });

  it("reconnects to a restarted relay and streams files through it", async () => {
    const relayData = tempDirs.createSync("relay-data-");
    const { relay, daemon } = await launch([], relayData);
    await requestDaemon("host.relay.set", { url: relay.url }, daemon.options);
    const status = await waitForRelay(
      daemon,
      (next) => next.relay.state === "online",
    );
    const endpoint = status.relay.endpoint ?? "";
    const { code, hostKey } = await requestDaemon(
      "host.pairing.create",
      { label: "Phone", scopes: ["read", "files.read", "interact"] },
      daemon.options,
    );
    const paired = await pairHost({
      baseUrl: endpoint,
      code,
      hostKey,
      label: "Pixel",
      store: createSavedHostStore(null),
    });

    await relay.stop();
    await waitForRelay(daemon, (next) => next.relay.state === "offline");
    const restarted = await startRelay(
      relayBinary,
      relayData,
      [],
      Number(new URL(relay.url).port),
    );
    relays.push(restarted);
    await waitForRelay(daemon, (next) => next.relay.state === "online");

    await expect(
      remoteClient(paired).request("host.session", undefined),
    ).resolves.toMatchObject({
      principal: { kind: "device", deviceId: paired.deviceId },
    });

    const image = Buffer.concat([
      Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x04, 0x00, 0x05, 0x00]),
      randomBytes(2 * 1024 * 1024),
    ]);
    const files = createRemoteFileClient({
      endpoint: async () => savedHostEndpoint(paired),
    });
    try {
      const attachment = await files.upload(
        { kind: "attachmentUpload", upload: "image", name: "large.gif" },
        image,
      );
      const read = await files.read({
        kind: "imageAttachment",
        file: path.basename(attachment.filePath),
      });
      const chunks: Uint8Array[] = [];
      for await (const chunk of read.body) chunks.push(chunk);
      expect(Buffer.concat(chunks).equals(image)).toBe(true);
    } finally {
      files.close();
    }
  });

  it("joins an invite-only relay once the CLI installs a credential", async () => {
    const keysFile = path.join(tempDirs.createSync("relay-keys-"), "keys.json");
    writeFileSync(keysFile, await runRelayCommand(relayBinary, ["keygen"]));
    const issuer = JSON.parse(readFileSync(keysFile, "utf8")) as {
      publicKey: string;
    };
    const { relay, daemon } = await launch([
      "--credential-issuer",
      issuer.publicKey,
    ]);
    const cli = { userDataPath: daemon.userDataPath };

    const set = await runCli(["host", "relay", "set", relay.url], cli);
    expect(set.code).toBe(0);
    await waitForRelay(
      daemon,
      (next) => next.relay.error === "credentialRequired",
    );

    const credentialFile = path.join(path.dirname(keysFile), "invite.json");
    writeFileSync(
      credentialFile,
      await runRelayCommand(relayBinary, [
        "credential",
        "--issuer-key-file",
        keysFile,
        "--account",
        "invite-7",
      ]),
    );
    const installed = await runCli(
      [
        "host",
        "relay",
        "set",
        relay.url,
        "--credential",
        credentialFile,
        "--json",
      ],
      cli,
    );
    expect(installed.code).toBe(0);
    expect(JSON.parse(installed.stdout).relay.credential).toMatchObject({
      accountId: "invite-7",
    });
    await waitForRelay(daemon, (next) => next.relay.state === "online");
  });
});
