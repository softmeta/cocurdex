import net from "node:net";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import { clickByRole, waitForNoRole, waitForRole } from "./lib/locate.mjs";
import { openSettingsSection, translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const DEVICE_LABEL = "Scenario Tablet";

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

async function pairDevice(session) {
  const port = await freePort();
  await daemonRequest(session, "host.remoteAccess.set", {
    enabled: true,
    port,
  });
  const { code } = await daemonRequest(session, "host.pairing.create", {
    label: DEVICE_LABEL,
    scopes: ["read"],
  });
  const response = await fetch(`http://127.0.0.1:${port}/api/pair`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, label: DEVICE_LABEL }),
  });
  check(response.ok, "pairing exchange succeeds", { status: response.status });
  const { deviceId } = await response.json();
  return { port, deviceId };
}

async function deviceScopes(session, deviceId) {
  const devices = await daemonRequest(session, "host.devices.list");
  return devices.find((device) => device.id === deviceId)?.scopes;
}

runScenario("device-access", {
  open: () => openScenarioApp(args),
  setup: async ({ session }) => {
    const paired = await pairDevice(session);
    await openSettingsSection(session, "devices");
    return paired;
  },
  steps: [
    [
      "a paired device's access can be changed from settings",
      async ({ session, deviceId }) => {
        const t = (key, options) =>
          translate(session, `settings:${key}`, options);
        await clickByRole(
          session,
          { role: "button", name: await t("devices.list.editAccess") },
          UI_TIMEOUT_MS,
        );
        const dialog = {
          role: "dialog",
          name: await t("devices.access.title", { name: DEVICE_LABEL }),
        };
        await waitForRole(session, dialog, UI_TIMEOUT_MS);
        await clickByRole(session, {
          role: "checkbox",
          name: await t("devices.scope.filesRead.title"),
          exact: false,
          within: dialog,
        });
        await clickByRole(session, {
          role: "button",
          name: await t("devices.access.save"),
          within: dialog,
        });
        await waitForNoRole(session, dialog, UI_TIMEOUT_MS);
        const scopes = await deviceScopes(session, deviceId);
        check(
          JSON.stringify(scopes) === JSON.stringify(["read", "files.read"]),
          "daemon stores the new scopes",
          { scopes },
        );
        return { scopes };
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
  teardown: async ({ session, deviceId, port }) => {
    if (deviceId) {
      await daemonRequest(session, "host.devices.revoke", {
        deviceId,
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
