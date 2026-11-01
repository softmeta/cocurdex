import { createRequire } from "node:module";
import path from "node:path";
import { requestDaemon } from "@cocurdex/daemon/client";
import { buildHostPairingLink } from "@cocurdex/shared";
import { createTempDirs } from "@cocurdex/test-fixtures/temp-dirs";
import {
  type DaemonProcess,
  repoRoot,
  sleep,
  spawnDaemon,
} from "@cocurdex/test-harness/helpers/daemon-process";
import {
  type ElectronApplication,
  _electron as electron,
} from "@playwright/test";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildRelay,
  freePort,
  type RelayProcess,
  startRelay,
} from "../helpers/relay";

const desktopRoot = path.join(repoRoot, "apps", "desktop");
const webRoot = path.join(desktopRoot, "out", "renderer");
const browserMain = createRequire(import.meta.url).resolve(
  "../helpers/web-browser-main.mjs",
);
const tempDirs = createTempDirs();
const WORKSPACE_NAME = "Relay garden";

function electronExecutable(): string {
  return createRequire(path.join(desktopRoot, "package.json"))("electron");
}

async function pairingLink(daemon: DaemonProcess) {
  const deadline = Date.now() + 15_000;
  let endpoint = "";
  while (!endpoint) {
    if (Date.now() > deadline) throw new Error("The relay never came online");
    const status = await requestDaemon("host.remoteAccess.get", daemon.options);
    if (status.relay.state === "online") endpoint = status.relay.endpoint ?? "";
    else await sleep(50);
  }
  const { code, hostKey } = await requestDaemon(
    "host.pairing.create",
    { label: "Browser", scopes: ["read", "interact", "files.read"] },
    daemon.options,
  );
  return buildHostPairingLink(endpoint, code, hostKey);
}

describe("web client through the relay", () => {
  let relay: RelayProcess | undefined;
  let daemon: DaemonProcess | undefined;
  let browser: ElectronApplication | undefined;

  afterAll(async () => {
    await browser?.close();
    await daemon?.dispose();
    await relay?.stop();
    await tempDirs.cleanup();
  });

  it("pairs from the page the relay serves, keeps the pairing across reloads, and unpairs", async () => {
    const relayBinary = await buildRelay(tempDirs.createSync("relay-bin-"));
    relay = await startRelay(relayBinary, tempDirs.createSync("relay-data-"), [
      "--web-root",
      webRoot,
    ]);
    daemon = await spawnDaemon();
    const now = new Date().toISOString();
    await requestDaemon(
      "workspace.save",
      {
        workspace: {
          id: "relay-workspace",
          name: WORKSPACE_NAME,
          rootPaths: [tempDirs.createSync("relay-ws-")],
          createdAt: now,
          updatedAt: now,
          lastOpenedAt: now,
          sortOrder: 0,
        },
      },
      daemon.options,
    );
    await requestDaemon(
      "host.remoteAccess.set",
      { enabled: true, port: await freePort() },
      daemon.options,
    );
    await requestDaemon("host.relay.set", { url: relay.url }, daemon.options);
    const link = await pairingLink(daemon);

    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    delete env.ELECTRON_RUN_AS_NODE;
    env.COCURDEX_WEB_BROWSER_PROFILE = tempDirs.createSync("web-profile-");
    browser = await electron.launch({
      executablePath: electronExecutable(),
      args: ["--no-sandbox", "--lang=en-US", browserMain, `${relay.url}/`],
      env,
    });
    const page = await browser.firstWindow();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.getByRole("textbox", { name: "Pairing link" }).fill(link);
    await page.getByRole("button", { name: "Pair" }).click();
    await expect
      .poll(() => page.getByText(WORKSPACE_NAME).first().isVisible(), {
        timeout: 30_000,
      })
      .toBe(true);

    const devices = await requestDaemon("host.devices.list", daemon.options);
    expect(devices.map((device) => device.label)).toContain("Web browser");

    await page.reload();
    await expect
      .poll(() => page.getByText(WORKSPACE_NAME).first().isVisible(), {
        timeout: 30_000,
      })
      .toBe(true);
    expect(
      await page.getByRole("textbox", { name: "Pairing link" }).count(),
    ).toBe(0);
    await page.getByRole("button", { name: "Settings" }).click();
    await page
      .getByRole("list")
      .getByRole("button", { name: "Devices" })
      .click();
    expect(consoleErrors).toEqual([]);
    await page.getByRole("button", { name: "Unpair" }).click();
    await expect
      .poll(
        () => page.getByRole("textbox", { name: "Pairing link" }).isVisible(),
        { timeout: 30_000 },
      )
      .toBe(true);
    const [unpaired] = await requestDaemon("host.devices.list", daemon.options);
    expect(unpaired?.revokedAt).not.toBeNull();
    expect(pageErrors).toEqual([]);
  }, 180_000);
});
