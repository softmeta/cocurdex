import { execFile } from "node:child_process";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
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
const PAIR_TIMEOUT_MS = 30_000;
const HARNESS_DIR = fileURLToPath(new URL("../harness/", import.meta.url));
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
  const { code, hostKey } = await daemonRequest(
    session,
    "host.pairing.create",
    { label: DEVICE_LABEL, scopes: ["read"] },
  );
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      "--import",
      "tsx",
      "remote/pair-device.ts",
      `--url=http://127.0.0.1:${port}`,
      `--code=${code}`,
      `--host-key=${hostKey}`,
      `--label=${DEVICE_LABEL}`,
    ],
    { cwd: HARNESS_DIR, timeout: PAIR_TIMEOUT_MS },
  );
  const { deviceId, safetyCode } = JSON.parse(
    stdout.trim().split(/\r?\n/).pop(),
  );
  return { port, deviceId, safetyCode };
}

async function findDevice(session, deviceId) {
  const devices = await daemonRequest(session, "host.devices.list");
  return devices.find((device) => device.id === deviceId);
}

async function enterSafetyCode(session, dialog, code) {
  const [field] = await waitForRole(session, {
    role: "textbox",
    name: await translate(session, "settings:devices.approval.codeLabel"),
    within: dialog,
  });
  await clickPoint(session, await centerOf(session, field.backendNodeId));
  await session.send("Input.insertText", { text: code });
  await clickByRole(session, {
    role: "button",
    name: await translate(session, "settings:devices.approval.allow"),
    within: dialog,
  });
}

runScenario("device-access", {
  open: () => openScenarioApp(args),
  setup: async ({ session }) => {
    return pairDevice(session);
  },
  steps: [
    [
      "a new device waits until its safety code is entered",
      async ({ session, deviceId, safetyCode }) => {
        const t = (key, options) =>
          translate(session, `settings:${key}`, options);
        const dialog = {
          role: "dialog",
          name: await t("devices.approval.title", { name: DEVICE_LABEL }),
        };
        await waitForRole(session, dialog, UI_TIMEOUT_MS);
        const pending = await findDevice(session, deviceId);
        check(
          pending?.approvedAt === null && pending?.safetyCode === null,
          "daemon keeps the device pending without revealing its code",
          pending,
        );

        const wrongCode = safetyCode === "000000" ? "111111" : "000000";
        await enterSafetyCode(session, dialog, wrongCode);
        await waitForRole(
          session,
          {
            role: "StaticText",
            name: await t("devices.approval.failure.codeMismatch"),
          },
          UI_TIMEOUT_MS,
        );
        check(
          (await findDevice(session, deviceId))?.approvedAt === null,
          "a wrong code leaves the device pending",
        );

        await enterSafetyCode(session, dialog, safetyCode);
        await waitForNoRole(session, dialog, UI_TIMEOUT_MS);
        const approved = await findDevice(session, deviceId);
        check(
          typeof approved?.approvedAt === "string" &&
            approved.safetyCode === safetyCode,
          "daemon approves the device with the code it shows",
          approved,
        );
        return { approvedAt: approved.approvedAt };
      },
    ],
    [
      "a paired device's access can be changed from settings",
      async ({ session, deviceId }) => {
        const t = (key, options) =>
          translate(session, `settings:${key}`, options);
        await openSettingsSection(session, "devices");
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
        const scopes = (await findDevice(session, deviceId))?.scopes;
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
