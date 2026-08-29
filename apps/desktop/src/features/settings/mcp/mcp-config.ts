export type McpServerForm = {
  args: string;
  env: string;
  id: string;
  name: string;
  raw: Record<string, unknown>;
  transport: "http" | "stdio";
  target: string;
};

export type McpConfig = Record<string, unknown> & {
  mcpServers: Record<string, Record<string, unknown>>;
};

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseMcpConfig(content: string): McpConfig {
  const config = asRecord(JSON.parse(content));
  const servers = asRecord(config?.mcpServers);
  if (!config || !servers) {
    throw new Error('MCP configuration must contain an "mcpServers" object');
  }
  return { ...config, mcpServers: servers } as McpConfig;
}

export function configToServerForms(config: McpConfig): McpServerForm[] {
  return Object.entries(config.mcpServers).map(([name, value]) => {
    const raw = asRecord(value) ?? {};
    const transport = typeof raw.url === "string" ? "http" : "stdio";
    const args = Array.isArray(raw.args)
      ? raw.args.filter((item): item is string => typeof item === "string")
      : [];
    const env = asRecord(raw.env) ?? {};
    return {
      args: args.join("\n"),
      env: Object.entries(env)
        .filter((entry): entry is [string, string] =>
          entry.every((item) => typeof item === "string"),
        )
        .map(([key, value]) => `${key}=${value}`)
        .join("\n"),
      id: name,
      name,
      raw,
      transport,
      target: String(
        transport === "http" ? (raw.url ?? "") : (raw.command ?? ""),
      ),
    };
  });
}

function parseEnv(value: string) {
  return Object.fromEntries(
    value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separator = line.indexOf("=");
        return separator < 0
          ? [line, ""]
          : [line.slice(0, separator).trim(), line.slice(separator + 1)];
      })
      .filter(([key]) => Boolean(key)),
  );
}

export function serializeServerForms(
  config: McpConfig,
  forms: McpServerForm[],
) {
  const names = forms.map((form) => form.name.trim());
  if (names.some((name) => !name)) {
    throw new Error("Every MCP server needs a name");
  }
  if (new Set(names).size !== names.length) {
    throw new Error("MCP server names must be unique");
  }
  if (forms.some((form) => !form.target.trim())) {
    throw new Error("Every MCP server needs a command or URL");
  }

  const mcpServers = Object.fromEntries(
    forms.map((form, index) => {
      const server = { ...form.raw };
      if (form.transport === "http") {
        delete server.command;
        delete server.args;
        server.url = form.target.trim();
      } else {
        delete server.url;
        server.command = form.target.trim();
        const args = form.args.split("\n").filter(Boolean);
        const env = parseEnv(form.env);
        if (args.length) server.args = args;
        else delete server.args;
        if (Object.keys(env).length) server.env = env;
        else delete server.env;
      }
      return [names[index], server];
    }),
  );

  return `${JSON.stringify({ ...config, mcpServers }, null, 2)}\n`;
}

export function createMcpServerName(forms: McpServerForm[]) {
  let index = forms.length + 1;
  while (forms.some((form) => form.name === `server-${index}`)) index += 1;
  return `server-${index}`;
}
