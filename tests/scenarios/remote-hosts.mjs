import net from "node:net";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import {
  centerOf,
  clickByRole,
  clickPoint,
  waitForNoRole,
  waitForRole,
} from "./lib/locate.mjs";
import { openSettingsSection, translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const REMOTE_SCOPES = ["read", "interact", "execute"];

const args = readScenarioArgs();

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function eventually(read, accept, timeout = UI_TIMEOUT_MS) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = await read();
    if (accept(value)) return value;
    if (Date.now() >= deadline) {
      throw new Error(`Timed out; last value: ${JSON.stringify(value)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

async function createPairingLink(session) {
  const port = await freePort();
  await daemonRequest(session, "host.remoteAccess.set", {
    enabled: true,
    port,
  });
  const { code, hostKey } = await daemonRequest(
    session,
    "host.pairing.create",
    { label: "Scenario Desk", scopes: REMOTE_SCOPES },
  );
  const link = new URL(`http://127.0.0.1:${port}/`);
  link.hash = new URLSearchParams({ pair: code, hk: hostKey }).toString();
  return { port, link: link.toString() };
}

const remoteHosts = (session) => daemonRequest(session, "host.remotes.list");

runScenario("remote-hosts", {
  open: () => openScenarioApp(args),
  setup: async ({ session }) => createPairingLink(session),
  steps: [
    [
      "pairs another computer from a pasted link",
      async ({ session, link }) => {
        const t = (key, options) =>
          translate(session, `settings:${key}`, options);
        await openSettingsSection(session, "devices");
        await clickByRole(
          session,
          { role: "button", name: await t("devices.remotes.pairOpen") },
          UI_TIMEOUT_MS,
        );
        const dialog = {
          role: "dialog",
          name: await t("devices.remotes.pairTitle"),
        };
        const [field] = await waitForRole(session, {
          role: "textbox",
          name: await t("devices.remotes.link"),
          within: dialog,
        });
        await clickPoint(session, await centerOf(session, field.backendNodeId));
        await session.send("Input.insertText", { text: link });
        await clickByRole(session, {
          role: "button",
          name: await t("devices.remotes.pair"),
          within: dialog,
        });
        const [host] = await eventually(
          () => remoteHosts(session),
          (hosts) => hosts[0]?.status === "pending",
        );
        const approval = await daemonRequest(session, "host.devices.approve", {
          deviceId: host.deviceId,
          code: host.safetyCode,
        });
        check(approval.ok, "the paired computer accepts the safety code");
        await waitForNoRole(
          session,
          {
            role: "dialog",
            name: await t("devices.approval.title", { name: host.name }),
          },
          UI_TIMEOUT_MS,
        );
        await waitForRole(
          session,
          { role: "StaticText", name: host.safetyCode, within: dialog },
          UI_TIMEOUT_MS,
        );
        await clickByRole(session, {
          role: "button",
          name: await t("devices.pair.done"),
          within: dialog,
        });
        await waitForNoRole(session, dialog, UI_TIMEOUT_MS);
        return { hostId: host.hostId, deviceId: host.deviceId };
      },
    ],
    [
      "shows the computer as connected once approved",
      async ({ session }) => {
        const [host] = await eventually(
          () => remoteHosts(session),
          (hosts) => hosts[0]?.status === "connected",
        );
        const detail = await translate(
          session,
          "settings:devices.remotes.detail",
          {
            status: await translate(
              session,
              "settings:devices.remotes.status.connected",
            ),
            code: host.safetyCode,
          },
        );
        await waitForRole(
          session,
          { role: "StaticText", name: detail },
          UI_TIMEOUT_MS,
        );
        return { status: host.status };
      },
    ],
    [
      "opens a window that works against that computer",
      async ({ session }) => {
        const [host] = await remoteHosts(session);
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "settings:devices.remotes.openLabel", {
            name: host.name,
          }),
        });
        const remote = await session.openPage("remoteHost=");
        try {
          await remote.waitUntil(
            (name) => document.title === name,
            host.name,
            UI_TIMEOUT_MS,
          );
          await openSettingsSection(remote, "devices");
          await waitForRole(
            remote,
            {
              role: "StaticText",
              name: await translate(remote, "settings:devices.webPaired.title"),
            },
            UI_TIMEOUT_MS,
          );
          await waitForRole(remote, { role: "StaticText", name: host.name });
          const errors = await remote.run(() => window.__scenario.errors);
          check(errors.length === 0, "remote window renderer errors", errors);
          await remote.run(() => window.close());
        } finally {
          remote.close();
        }
        return { title: host.name };
      },
    ],
    [
      "removing the computer revokes this one there",
      async ({ session }) => {
        const t = (key, options) =>
          translate(session, `settings:${key}`, options);
        const [host] = await remoteHosts(session);
        const { deviceId } = host;
        await clickByRole(session, {
          role: "button",
          name: await t("devices.remotes.remove"),
        });
        const confirm = {
          role: "dialog",
          name: await t("devices.remotes.removeTitle", { name: host.name }),
        };
        await waitForRole(session, confirm, UI_TIMEOUT_MS);
        await clickByRole(session, {
          role: "button",
          name: await t("devices.remotes.remove"),
          within: confirm,
        });
        await waitForNoRole(session, confirm, UI_TIMEOUT_MS);
        await waitForRole(
          session,
          { role: "StaticText", name: await t("devices.remotes.empty") },
          UI_TIMEOUT_MS,
        );
        const devices = await daemonRequest(session, "host.devices.list");
        const device = devices.find((item) => item.id === deviceId);
        check(
          typeof device?.revokedAt === "string",
          "the other computer revokes this computer's device",
          device,
        );
        return {};
      },
    ],
    [
      "renderer has no errors",
      async ({ session }) => {
        const errors = await session.run(() => window.__scenario.errors);
        check(errors.length === 0, "renderer errors", errors);
        return {};
      },
    ],
  ],
  teardown: async ({ session, port }) => {
    for (const host of await remoteHosts(session).catch(() => [])) {
      await daemonRequest(session, "host.remotes.remove", {
        hostId: host.hostId,
      });
    }
    if (port) {
      await daemonRequest(session, "host.remoteAccess.set", {
        enabled: false,
        port,
      });
    }
    return {};
  },
});
