import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./lib/appearance.mjs";
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
const STATUS_TIMEOUT_MS = 60_000;
const EMPTY_CONFIG = '{\n  "mcpServers": {}\n}\n';
const FIXTURE_SERVER = createRequire(import.meta.url).resolve(
  "../e2e/fixtures/mcp-stdio-server.mjs",
);

const args = readScenarioArgs();

function quoteArg(value) {
  return /[\s"'\\]/.test(value)
    ? `"${value.replace(/(["\\])/g, "\\$1")}"`
    : value;
}

async function resetMcpConfig(session) {
  await daemonRequest(session, "mcp.saveConfig", { content: EMPTY_CONFIG });
  return true;
}

async function readMcpConfig(session) {
  return JSON.parse((await daemonRequest(session, "mcp.readConfig")).content);
}

async function waitForServerAgents(session, name, agents) {
  const expected = JSON.stringify(agents);
  const deadline = Date.now() + UI_TIMEOUT_MS;
  for (;;) {
    const server = (await readMcpConfig(session)).mcpServers[name];
    if (JSON.stringify(server?.cocurdex?.agents) === expected) return server;
    if (Date.now() > deadline) {
      throw new Error(`${name} agents: ${JSON.stringify(server)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

async function fillTextbox(session, name, value) {
  const [field] = await waitForRole(
    session,
    { role: "textbox", name },
    UI_TIMEOUT_MS,
  );
  await clickPoint(session, await centerOf(session, field.backendNodeId));
  await session.run(
    (text) => window.__scenario.setInput(document.activeElement, text),
    value,
  );
}

function serverDotLabel(name) {
  return document
    .querySelector(`[data-mcp-server="${name}"] [role="img"]`)
    ?.getAttribute("aria-label");
}

function readLayout(searchLabel) {
  const rectOf = (element) => element?.getBoundingClientRect() ?? null;
  const search = rectOf(window.__scenario.byLabel(searchLabel));
  const detail = rectOf(document.querySelector("[data-mcp-detail]"));
  const rows = [...document.querySelectorAll("[data-mcp-server]")].map(
    (row) => {
      const rect = row.getBoundingClientRect();
      return { left: rect.left, right: rect.right };
    },
  );
  const scroller =
    document.querySelector("[data-mcp-detail]")?.parentElement?.parentElement;
  return {
    searchTop: search?.top ?? null,
    detailTop: detail?.top ?? null,
    listRight: rows[0]?.right ?? null,
    detailLeft: detail?.left ?? null,
    rows,
    pageOverflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    detailOverflow: scroller ? scroller.scrollWidth - scroller.clientWidth : 0,
  };
}

async function capture(session, theme) {
  const artifacts = process.env.COCURDEX_TEST_ARTIFACTS_DIR;
  if (!artifacts) return null;
  const { data } = await session.send("Page.captureScreenshot", {
    format: "png",
  });
  await mkdir(artifacts, { recursive: true });
  const file = path.join(artifacts, `mcp-settings-${theme}.png`);
  await writeFile(file, Buffer.from(data, "base64"));
  return file;
}

async function writeAgentConfigs(workspaceRoot) {
  await mkdir(path.join(workspaceRoot, ".codex"), { recursive: true });
  await writeFile(
    path.join(workspaceRoot, ".codex", "config.toml"),
    '[mcp_servers.scenario-codex]\nurl = "https://codex.example.invalid/mcp"\n',
  );
  await mkdir(path.join(workspaceRoot, ".opencode"), { recursive: true });
  await writeFile(
    path.join(workspaceRoot, ".opencode", "opencode.jsonc"),
    `{
      // scenario
      "mcp": {
        "scenario-opencode": {
          "type": "local",
          "command": ["bunx", "scenario-mcp", "{env:TOKEN}"],
        },
      },
    }`,
  );
}

function readImportRow(key) {
  const row = document.querySelector(`[data-mcp-import="${key}"]`);
  return row?.querySelector("span > span + *")?.textContent ?? null;
}

runScenario("mcp-settings", {
  open: () => openScenarioApp(args),
  setup: async ({ session, workspaceRoot }) => {
    await resetMcpConfig(session);
    await openSettingsSection(session, "mcp");
    const t = (key, options) => translate(session, `settings:${key}`, options);
    return { t, workspaceRoot };
  },
  steps: [
    [
      "the page opens with one empty state instead of the empty columns",
      async ({ session, t }) => {
        await waitForRole(
          session,
          { role: "region", name: await t("mcp.empty.title") },
          UI_TIMEOUT_MS,
        );
        await waitForRole(session, {
          role: "button",
          name: await t("mcp.empty.add"),
        });
        await waitForRole(session, {
          role: "button",
          name: await t("mcp.editJson"),
        });
        const leftovers = await session.run(
          ({ search, dropzone }) => ({
            search: Boolean(window.__scenario.byLabel(search)),
            dropzone: document.body.innerText.includes(dropzone),
          }),
          {
            search: await t("mcp.list.search"),
            dropzone: await t("mcp.jsonImport.label"),
          },
        );
        check(
          !leftovers.search && !leftovers.dropzone,
          "empty state hides the list and the JSON dropzone",
          leftovers,
        );
        return leftovers;
      },
    ],
    [
      "adding a local server saves it and lists its tools",
      async ({ session, t }) => {
        await clickByRole(session, {
          role: "button",
          name: await t("mcp.empty.add"),
        });
        await clickByRole(session, {
          role: "menuitem",
          name: await t("jsonImport.addManually"),
        });
        await fillTextbox(session, await t("mcp.fields.name"), "fixture");
        await fillTextbox(
          session,
          await t("mcp.fields.command"),
          process.execPath,
        );
        await fillTextbox(
          session,
          await t("mcp.fields.args"),
          quoteArg(FIXTURE_SERVER),
        );
        await clickByRole(session, {
          role: "button",
          name: await t("mcp.actions.save"),
        });
        await session.waitUntil(
          () => Boolean(document.querySelector('[data-mcp-tool="echo"]')),
          null,
          STATUS_TIMEOUT_MS,
        );
        const config = await readMcpConfig(session);
        check(
          config.mcpServers.fixture?.command === process.execPath,
          "saved command",
          config,
        );
        const dot = await session.run(serverDotLabel, "fixture");
        check(dot === (await t("mcp.state.connected")), "list status", dot);
        return { dot };
      },
    ],
    [
      "the list offers every way to add a server from one menu",
      async ({ session, t }) => {
        const importLabel = await t("mcp.list.importFromAgents");
        await clickByRole(session, {
          role: "button",
          name: await t("mcp.list.add"),
        });
        await waitForRole(session, { role: "menuitem", name: importLabel });
        await waitForRole(session, {
          role: "menuitem",
          name: await t("jsonImport.chooseFile"),
        });
        await session.send("Input.dispatchKeyEvent", {
          type: "keyDown",
          key: "Escape",
          code: "Escape",
          windowsVirtualKeyCode: 27,
        });
        await session.waitUntil(
          () => !document.querySelector('[role="menu"]'),
          null,
          UI_TIMEOUT_MS,
        );
        const standalone = await session.run(
          (label) =>
            [...document.querySelectorAll("button")].some(
              (button) => button.textContent?.trim() === label,
            ),
          importLabel,
        );
        const dropzone = await session.run(
          (label) => document.body.innerText.includes(label),
          await t("mcp.jsonImport.label"),
        );
        check(!standalone, "no standalone import button", { standalone });
        check(!dropzone, "no inline JSON import section", { dropzone });
        return { standalone, dropzone };
      },
    ],
    [
      "the Enabled switch writes the config immediately",
      async ({ session, t }) => {
        await clickByRole(session, {
          role: "switch",
          name: await t("mcp.detail.enabled"),
        });
        const disabled = await t("mcp.state.disabled");
        await session.waitUntil(
          ({ name, label }) =>
            document
              .querySelector(`[data-mcp-server="${name}"] [role="img"]`)
              ?.getAttribute("aria-label") === label,
          { name: "fixture", label: disabled },
          UI_TIMEOUT_MS,
        );
        const config = await readMcpConfig(session);
        check(
          config.mcpServers.fixture.enabled === false,
          "enabled flag",
          config,
        );
        await clickByRole(session, {
          role: "switch",
          name: await t("mcp.detail.enabled"),
        });
        await session.waitUntil(
          ({ name, label }) =>
            document
              .querySelector(`[data-mcp-server="${name}"] [role="img"]`)
              ?.getAttribute("aria-label") === label,
          { name: "fixture", label: await t("mcp.state.connected") },
          STATUS_TIMEOUT_MS,
        );
        return {};
      },
    ],
    [
      "agent switches assign the server to agents and write the config",
      async ({ session }) => {
        const agentSwitch = (agent) =>
          session.run((id) => {
            const control = document.querySelector(
              `[data-mcp-agent="${id}"] [role="switch"]`,
            );
            if (!control) return null;
            control.scrollIntoView({ block: "center" });
            const rect = control.getBoundingClientRect();
            return {
              checked: control.getAttribute("aria-checked") === "true",
              disabled: control.getAttribute("aria-disabled") === "true",
              x: rect.x + rect.width / 2,
              y: rect.y + rect.height / 2,
            };
          }, agent);
        await session.waitUntil(
          () => Boolean(document.querySelector('[data-mcp-agent="codex"]')),
          null,
          UI_TIMEOUT_MS,
        );
        const pi = await agentSwitch("pi");
        const opencode = await agentSwitch("opencode");
        check(pi?.checked === true, "Pi receives servers by default", pi);
        check(
          opencode?.disabled === false,
          "OpenCode can receive servers",
          opencode,
        );
        const codex = await agentSwitch("codex");
        check(codex?.checked === false, "Codex starts unassigned", codex);
        await clickPoint(session, { x: codex.x, y: codex.y });
        await session.waitUntil(
          () =>
            document
              .querySelector('[data-mcp-agent="codex"] [role="switch"]')
              ?.getAttribute("aria-checked") === "true",
          null,
          UI_TIMEOUT_MS,
        );
        const assigned = await waitForServerAgents(session, "fixture", [
          "pi",
          "codex",
        ]);
        const assignedCodex = await agentSwitch("codex");
        check(
          assignedCodex.checked,
          "the switch stays on once saved",
          assignedCodex,
        );
        await clickPoint(session, { x: assignedCodex.x, y: assignedCodex.y });
        await session.waitUntil(
          () =>
            document
              .querySelector('[data-mcp-agent="codex"] [role="switch"]')
              ?.getAttribute("aria-checked") === "false",
          null,
          UI_TIMEOUT_MS,
        );
        await waitForServerAgents(session, "fixture", ["pi"]);
        return { pi, opencode, assigned: assigned.cocurdex };
      },
    ],
    [
      "pasted JSON imports a remote server after confirmation",
      async ({ session, t }) => {
        await clickByRole(session, {
          role: "button",
          name: await t("mcp.list.add"),
        });
        await clickByRole(session, {
          role: "menuitem",
          name: await translate(session, "settings:jsonImport.pasteButton"),
        });
        const [field] = await waitForRole(session, {
          role: "textbox",
          name: await translate(session, "settings:jsonImport.pasteLabel"),
        });
        await clickPoint(session, await centerOf(session, field.backendNodeId));
        await session.send("Input.insertText", {
          text: '"remote": { "url": "https://mcp.example.invalid/mcp" }',
        });
        await clickByRole(session, {
          role: "button",
          name: await translate(session, "settings:jsonImport.continue"),
        });
        await clickByRole(
          session,
          {
            role: "button",
            name: await t("mcp.import.confirm", { count: 1 }),
          },
          UI_TIMEOUT_MS,
        );
        await session.waitUntil(
          () =>
            Boolean(document.querySelector('[data-mcp-server="remote"]')) &&
            !document.querySelector('[role="dialog"]'),
          null,
          UI_TIMEOUT_MS,
        );
        await session.waitUntil(
          () => document.querySelector("[data-mcp-detail]")?.dataset.mcpDetail,
          null,
          UI_TIMEOUT_MS,
        );
        const selected = await session.run(
          () => document.querySelector("[data-mcp-detail]").dataset.mcpDetail,
        );
        check(selected === "remote", "imported server selected", selected);
        await waitForRole(session, {
          role: "button",
          name: await t("mcp.auth.oauth"),
        });
        const config = await readMcpConfig(session);
        check(
          config.mcpServers.remote?.url === "https://mcp.example.invalid/mcp",
          "imported config",
          config,
        );
        return {};
      },
    ],
    [
      "importing from other agents lists Codex and OpenCode servers",
      async ({ session, t, workspaceRoot }) => {
        await writeAgentConfigs(workspaceRoot);
        await clickByRole(session, {
          role: "button",
          name: await t("mcp.list.add"),
        });
        await clickByRole(session, {
          role: "menuitem",
          name: await t("mcp.list.importFromAgents"),
        });
        await waitForRole(session, {
          role: "dialog",
          name: await t("mcp.import.agentsTitle"),
        });
        const expected = {
          "codex-project:scenario-codex": `${await t("mcp.import.source.codex-project")} · https://codex.example.invalid/mcp`,
          "opencode-project:scenario-opencode": `${await t("mcp.import.source.opencode-project")} · bunx scenario-mcp \${TOKEN}`,
        };
        const rows = {};
        for (const key of Object.keys(expected)) {
          await session.waitUntil(readImportRow, key, UI_TIMEOUT_MS);
          rows[key] = await session.run(readImportRow, key);
        }
        for (const [key, text] of Object.entries(expected)) {
          check(rows[key] === text, `${key} row`, rows);
        }
        await clickByRole(session, {
          role: "button",
          name: await t("mcp.import.cancel"),
        });
        await waitForNoRole(session, { role: "dialog" });
        return { rows };
      },
    ],
    [
      "JSON mode refuses to save invalid JSON",
      async ({ session, t }) => {
        await clickByRole(session, {
          role: "button",
          name: await t("mcp.editJson"),
        });
        const [editor] = await waitForRole(session, {
          role: "textbox",
          name: await t("mcp.json.label"),
        });
        await clickPoint(
          session,
          await centerOf(session, editor.backendNodeId),
        );
        await session.send("Input.insertText", { text: "{" });
        await waitForRole(session, { role: "alert" });
        const save = await session.run(
          (label) =>
            [...document.querySelectorAll("button")].find(
              (button) => button.textContent.trim() === label,
            )?.disabled,
          await t("mcp.actions.save"),
        );
        check(save === true, "save stays disabled", save);
        await clickByRole(session, {
          role: "button",
          name: await t("mcp.backToForm"),
        });
        await session.waitUntil(
          () => Boolean(document.querySelector("[data-mcp-detail]")),
          null,
          UI_TIMEOUT_MS,
        );
        return {};
      },
    ],
    [
      "the two columns align and nothing overflows in both themes",
      async ({ session, t }) => {
        const searchLabel = await t("mcp.list.search");
        const results = {};
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          await session.waitUntil(
            () =>
              document
                .getAnimations()
                .every((animation) => animation.playState !== "running"),
            null,
            UI_TIMEOUT_MS,
          );
          const layout = await session.run(readLayout, searchLabel);
          check(
            Math.abs(layout.searchTop - layout.detailTop) < 0.5,
            "list and detail tops differ",
            layout,
          );
          check(
            layout.listRight < layout.detailLeft,
            "columns overlap",
            layout,
          );
          check(
            new Set(layout.rows.map((row) => row.left)).size === 1 &&
              new Set(layout.rows.map((row) => row.right)).size === 1,
            "rows misaligned",
            layout,
          );
          check(layout.pageOverflow === 0, "page overflows", layout);
          check(layout.detailOverflow === 0, "detail overflows", layout);
          results[theme] = {
            ...layout,
            screenshot: await capture(session, theme),
          };
        }
        await clearColorScheme(session);
        return results;
      },
    ],
    [
      "removing a server asks for confirmation",
      async ({ session, t }) => {
        const [row] = await waitForRole(session, {
          role: "button",
          name: /^fixture/,
        });
        await clickPoint(session, await centerOf(session, row.backendNodeId));
        await session.waitUntil(
          () =>
            document.querySelector("[data-mcp-detail]")?.dataset.mcpDetail ===
            "fixture",
          null,
          UI_TIMEOUT_MS,
        );
        await clickByRole(session, {
          role: "button",
          name: await t("mcp.actions.remove"),
        });
        await clickByRole(session, {
          role: "button",
          name: await t("mcp.removeConfirm.confirm"),
          within: { role: "dialog" },
        });
        await session.waitUntil(
          () => !document.querySelector('[data-mcp-server="fixture"]'),
          null,
          UI_TIMEOUT_MS,
        );
        await waitForNoRole(session, { role: "dialog" });
        const config = await readMcpConfig(session);
        check(!("fixture" in config.mcpServers), "server removed", config);
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
  teardown: async ({ session }) => {
    await resetMcpConfig(session);
    return {};
  },
});
