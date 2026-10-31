import { readFile } from "node:fs/promises";
import { requestDaemon } from "@cocurdex/daemon/client";
import {
  type AgentMcpUnsupportedReason,
  MCP_IMPORT_SOURCES,
  type McpImportSource,
  type McpServerConfig,
  type McpServerStatus,
  type McpStatusReport,
  mcpServerAgents,
  PI_MCP_AGENT_ID,
  parseMcpServersJson,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import {
  buildMcpServerConfig,
  MCP_ADD_OPTIONS,
  type McpArgs,
  parseAgentIds,
  parseMcpArgs,
  redactMcpServer,
  stringValue,
} from "./mcp-args";
import { openBrowser } from "./provider-login";
import { readStdin } from "./read-stdin";
import { resolveWorkspaceId } from "./workspace-lookup";

export function mcpUsageLines() {
  return [
    "  cocurdex mcp list [--workspace <id|path>] [--json]",
    "  cocurdex mcp show [<name>]",
    "  cocurdex mcp add <name> [--env KEY=VALUE]... [--cwd <dir>] [--description <text>] [--disabled] [--agent <id>]... -- <command> [args...]",
    "  cocurdex mcp add <name> --url <url> [--header KEY=VALUE]... [--bearer-token-env-var <NAME>] [--description <text>] [--disabled] [--agent <id>]...",
    "  cocurdex mcp remove <name>",
    "  cocurdex mcp enable|disable <name>",
    "  cocurdex mcp agents <name> [<agent>...|--none] [--json]",
    "  cocurdex mcp test <name> [--workspace <id|path>] [--json]",
    "  cocurdex mcp login <name> [--workspace <id|path>]",
    "  cocurdex mcp logout <name> [--workspace <id|path>]",
    "  cocurdex mcp import <file|-> [--overwrite]",
    `  cocurdex mcp import --from ${MCP_IMPORT_SOURCES.join("|")} [--name <name>]... [--overwrite] [--workspace <id|path>]`,
  ];
}

function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

async function workspaceOption(args: McpArgs) {
  const workspace = stringValue(args, "workspace");
  return workspace ? resolveWorkspaceId(workspace) : undefined;
}

function requireName(args: McpArgs, usage: string) {
  const [name, ...extra] = args.positional;
  if (!name || extra.length > 0) throw new Error(`Usage: ${usage}`);
  return name;
}

function describeState(server: McpServerStatus) {
  if (server.state === "connected") {
    return `connected, ${server.tools.length} tool${server.tools.length === 1 ? "" : "s"}`;
  }
  if (server.state === "needs-auth") return "needs sign-in";
  return server.state;
}

function printStatus(
  report: McpStatusReport,
  json: boolean,
  servers: Record<string, McpServerConfig>,
) {
  if (json) {
    printJson({
      ...report,
      servers: report.servers.map((server) => ({
        ...server,
        agents: agentsOf(servers, server.name),
      })),
    });
  } else {
    if (report.servers.length === 0 && report.errors.length === 0) {
      console.log("No MCP servers configured");
    }
    for (const server of report.servers) {
      console.log(`${server.name}: ${describeState(server)} (${server.scope})`);
      const agents = agentsOf(servers, server.name);
      if (agents) console.log(`  agents: ${agents.join(", ") || "none"}`);
      if (server.tools.length > 0) {
        console.log(
          `  tools: ${server.tools.map((tool) => tool.name).join(", ")}`,
        );
      }
      if (server.state === "needs-auth") {
        console.log(`  sign in with: cocurdex mcp login ${server.name}`);
      }
      if (server.error) {
        console.log(`  ${server.error.split("\n").join("\n  ")}`);
      }
    }
    for (const error of report.errors) console.log(`config error: ${error}`);
  }
  const failed =
    report.errors.length > 0 ||
    report.servers.some(
      (server) => server.state !== "connected" && server.state !== "disabled",
    );
  if (failed) process.exitCode = 1;
}

function agentsOf(servers: Record<string, McpServerConfig>, name: string) {
  const config = servers[name];
  return config ? mcpServerAgents(config) : null;
}

const UNSUPPORTED_REASONS: Record<AgentMcpUnsupportedReason, string> = {
  invalid: "the definition has neither a command nor a url",
  "command-value": "a value runs a command (!cmd), which only Pi resolves",
  "provider-auth": "it signs in through a Pi provider",
  cwd: "it sets cwd, which only Pi supports",
  "missing-env": "it references an environment variable the daemon lacks",
};

async function serverAgents(args: McpArgs) {
  const [name, ...requested] = args.positional;
  const none = args.values.has("none");
  if (!name || (none && requested.length > 0)) {
    throw new Error(
      "Usage: cocurdex mcp agents <name> [<agent>...|--none] [--json]",
    );
  }
  const { servers } = await readServers();
  if (!servers[name]) throw new Error(`No MCP server named "${name}"`);
  const updating = none || requested.length > 0;
  const agents = updating
    ? parseAgentIds(requested)
    : mcpServerAgents(servers[name]);
  if (updating) {
    await withDaemon(() =>
      requestDaemon("mcp.server.setAgents", { name, agents }),
    );
  }
  const support = await withDaemon(() => requestDaemon("mcp.injection.check"));
  const unsupported = support[name] ?? null;
  const injected = agents.filter((agent) => agent !== PI_MCP_AGENT_ID);
  if (args.values.has("json")) {
    printJson({ name, agents, unsupported });
    return;
  }
  console.log(
    `${updating ? "Set" : "MCP server"} "${name}" agents: ${agents.join(", ") || "none"}`,
  );
  if (unsupported && injected.length > 0) {
    console.log(
      `  only Pi can use it: ${UNSUPPORTED_REASONS[unsupported]}; ${injected.join(", ")} will not receive it`,
    );
  }
}

async function readServers() {
  const file = await withDaemon(() => requestDaemon("mcp.readConfig"));
  const parsed = JSON.parse(file.content) as {
    mcpServers?: Record<string, McpServerConfig>;
  };
  return { path: file.path, servers: parsed.mcpServers ?? {} };
}

async function show(args: McpArgs) {
  const [name] = args.positional;
  const { path, servers } = await readServers();
  if (!name) {
    console.log(path);
    printJson({
      mcpServers: Object.fromEntries(
        Object.entries(servers).map(([key, value]) => [
          key,
          redactMcpServer(value),
        ]),
      ),
    });
    return;
  }
  const server = servers[name];
  if (!server) throw new Error(`No MCP server named "${name}"`);
  printJson(redactMcpServer(server));
}

async function login(name: string, workspaceId: string | undefined) {
  const started = await withDaemon(() =>
    requestDaemon("mcp.login.start", { name, workspaceId }),
  );
  if (!started.loginId || !started.authUrl) {
    console.log(`Already signed in to MCP server "${name}"`);
    return;
  }
  console.log(`Sign in to MCP server "${name}" in your browser:`);
  console.log(started.authUrl);
  if (process.stdout.isTTY) openBrowser(started.authUrl);
  const loginId = started.loginId;
  const outcome = await withDaemon(() =>
    requestDaemon("mcp.login.wait", { loginId }),
  );
  if (!outcome.success) {
    throw new Error(outcome.error ?? `Sign-in to "${name}" failed`);
  }
  console.log(`Signed in to MCP server "${name}"`);
}

async function readImportText(file: string) {
  return file === "-" ? readStdin() : readFile(file, "utf8");
}

function isImportSource(value: string): value is McpImportSource {
  return (MCP_IMPORT_SOURCES as readonly string[]).includes(value);
}

async function selectFromAgent(
  source: McpImportSource,
  args: McpArgs,
  workspaceId: string | undefined,
) {
  const names = args.lists.get("name");
  const overwrite = args.values.has("overwrite");
  const candidates = (
    await withDaemon(() => requestDaemon("mcp.import.scan", { workspaceId }))
  ).filter(
    (candidate) =>
      candidate.source === source && (!names || names.includes(candidate.name)),
  );
  const servers: Record<string, McpServerConfig> = {};
  for (const candidate of candidates) {
    if (candidate.unsupported) {
      console.log(`skipped ${candidate.name}: ${candidate.unsupported}`);
    } else if (candidate.match === "same") {
      console.log(`skipped ${candidate.name}: already configured`);
    } else if (candidate.match === "different" && !overwrite) {
      console.log(
        `skipped ${candidate.name}: differs from the configured definition (use --overwrite)`,
      );
    } else {
      servers[candidate.name] = candidate.config;
    }
  }
  return servers;
}

async function selectFromJson(file: string, args: McpArgs) {
  const parsed = parseMcpServersJson(await readImportText(file));
  if (args.values.has("overwrite")) return parsed;
  const { servers: current } = await readServers();
  return Object.fromEntries(
    Object.entries(parsed).filter(([name]) => {
      const exists = current[name] !== undefined;
      if (exists) {
        console.log(`skipped ${name}: already exists (use --overwrite)`);
      }
      return !exists;
    }),
  );
}

async function importServers(args: McpArgs) {
  const from = stringValue(args, "from");
  const [file] = args.positional;
  if (Boolean(from) === Boolean(file)) {
    throw new Error(
      "Usage: cocurdex mcp import <file|-> | --from <agent> [--name <name>]...",
    );
  }
  if (from && !isImportSource(from)) {
    throw new Error(
      `--from must be one of ${MCP_IMPORT_SOURCES.join(", ")}, got "${from}"`,
    );
  }
  const servers =
    from && isImportSource(from)
      ? await selectFromAgent(from, args, await workspaceOption(args))
      : await selectFromJson(file, args);
  const names = Object.keys(servers);
  if (names.length === 0) {
    console.log("Nothing to import");
    return;
  }
  await withDaemon(() => requestDaemon("mcp.servers.merge", { servers }));
  console.log(`Imported ${names.join(", ")}`);
}

const WORKSPACE_OPTION = { workspace: "value" } as const;

export async function handleMcpCommand(rawArgs: string[]) {
  const [action, ...rest] = rawArgs;
  switch (action) {
    case "list": {
      const args = parseMcpArgs(rest, { ...WORKSPACE_OPTION, json: "flag" });
      const workspaceId = await workspaceOption(args);
      const report = await withDaemon(() =>
        requestDaemon("mcp.status", { workspaceId }),
      );
      const { servers } = await readServers();
      printStatus(report, args.values.has("json"), servers);
      return true;
    }
    case "show":
      await show(parseMcpArgs(rest, {}));
      return true;
    case "add": {
      const args = parseMcpArgs(rest, MCP_ADD_OPTIONS);
      const { name, config } = buildMcpServerConfig(args);
      const saved = await withDaemon(() =>
        requestDaemon("mcp.server.save", { name, config }),
      );
      console.log(`Saved MCP server "${name}" in ${saved.path}`);
      console.log(`Check it with: cocurdex mcp test ${name}`);
      return true;
    }
    case "agents":
      await serverAgents(parseMcpArgs(rest, { none: "flag", json: "flag" }));
      return true;
    case "remove": {
      const name = requireName(
        parseMcpArgs(rest, {}),
        "cocurdex mcp remove <name>",
      );
      await withDaemon(() => requestDaemon("mcp.server.remove", { name }));
      console.log(`Removed MCP server "${name}"`);
      return true;
    }
    case "enable":
    case "disable": {
      const name = requireName(
        parseMcpArgs(rest, {}),
        `cocurdex mcp ${action} <name>`,
      );
      const enabled = action === "enable";
      await withDaemon(() =>
        requestDaemon("mcp.server.setEnabled", { name, enabled }),
      );
      console.log(`${enabled ? "Enabled" : "Disabled"} MCP server "${name}"`);
      return true;
    }
    case "test": {
      const args = parseMcpArgs(rest, { ...WORKSPACE_OPTION, json: "flag" });
      const name = requireName(args, "cocurdex mcp test <name>");
      const workspaceId = await workspaceOption(args);
      const report = await withDaemon(() =>
        requestDaemon("mcp.status", { workspaceId, names: [name] }),
      );
      if (report.servers.length === 0) {
        throw new Error(`No MCP server named "${name}"`);
      }
      const { servers } = await readServers();
      printStatus(report, args.values.has("json"), servers);
      return true;
    }
    case "login": {
      const args = parseMcpArgs(rest, WORKSPACE_OPTION);
      const name = requireName(args, "cocurdex mcp login <name>");
      await login(name, await workspaceOption(args));
      return true;
    }
    case "logout": {
      const args = parseMcpArgs(rest, WORKSPACE_OPTION);
      const name = requireName(args, "cocurdex mcp logout <name>");
      const workspaceId = await workspaceOption(args);
      const result = await withDaemon(() =>
        requestDaemon("mcp.logout", { name, workspaceId }),
      );
      console.log(
        result.removed
          ? `Signed out of MCP server "${name}"`
          : `No stored sign-in for MCP server "${name}"`,
      );
      return true;
    }
    case "import":
      await importServers(
        parseMcpArgs(rest, {
          ...WORKSPACE_OPTION,
          from: "value",
          name: "list",
          overwrite: "flag",
        }),
      );
      return true;
    default:
      return false;
  }
}
