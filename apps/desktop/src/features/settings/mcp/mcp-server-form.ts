import { isValidMcpServerName, type McpServerConfig } from "@cocurdex/shared";

export type McpTransport = "stdio" | "http";
export type McpAuthMode = "oauth" | "bearer";
export type McpExposure = "codemode" | "deferred" | "direct" | "hidden";

export const MCP_EXPOSURES: McpExposure[] = [
  "codemode",
  "deferred",
  "direct",
  "hidden",
];

export interface McpKeyValueRow {
  id: string;
  key: string;
  value: string;
}

export interface McpServerForm {
  name: string;
  transport: McpTransport;
  command: string;
  args: string;
  env: McpKeyValueRow[];
  url: string;
  headers: McpKeyValueRow[];
  authMode: McpAuthMode;
  bearerToken: string;
  enabled: boolean;
  exposure: McpExposure;
  oauthClientId: string;
  oauthClientSecret: string;
  oauthCallbackPort: string;
  rest: Record<string, unknown>;
}

export type McpFormError =
  | "nameRequired"
  | "nameInvalid"
  | "nameTaken"
  | "commandRequired"
  | "urlRequired"
  | "urlInvalid"
  | "callbackPortInvalid";

let rowSequence = 0;

export function createKeyValueRow(key = "", value = ""): McpKeyValueRow {
  rowSequence += 1;
  return { id: `row-${rowSequence}`, key, value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringRecordRows(value: unknown) {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([key, item]) => createKeyValueRow(key, item));
}

function rowsToRecord(rows: McpKeyValueRow[]) {
  return Object.fromEntries(
    rows
      .map((row) => [row.key.trim(), row.value] as const)
      .filter(([key]) => key.length > 0),
  );
}

const ARG_TOKEN = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;

export function splitArgs(value: string): string[] {
  return Array.from(value.matchAll(ARG_TOKEN), (match) => {
    if (match[1] !== undefined) return match[1].replace(/\\(.)/g, "$1");
    return match[2] ?? match[3];
  });
}

function quoteArg(arg: string) {
  if (arg.length > 0 && !/[\s"'\\]/.test(arg)) return arg;
  return `"${arg.replace(/(["\\])/g, "\\$1")}"`;
}

export function joinArgs(args: string[]) {
  return args.map(quoteArg).join(" ");
}

const BEARER = /^Bearer\s+(.+)$/i;

function isExposure(value: unknown): value is McpExposure {
  return MCP_EXPOSURES.includes(value as McpExposure);
}

const STDIO_ONLY_KEYS = ["cwd"];
const HTTP_ONLY_KEYS = ["auth"];

const FORM_KEYS = [
  "type",
  "command",
  "args",
  "env",
  "url",
  "headers",
  "enabled",
  "exposure",
  "oauth",
  "cocurdex",
];

export function serverConfigToForm(
  name: string,
  config: McpServerConfig,
): McpServerForm {
  const transport: McpTransport =
    typeof config.url === "string" ? "http" : "stdio";
  const headerRows = stringRecordRows(config.headers);
  const authorization = headerRows.find(
    (row) => row.key.toLowerCase() === "authorization",
  );
  const bearer = authorization ? BEARER.exec(authorization.value) : null;
  const oauth = isRecord(config.oauth) ? config.oauth : {};
  const args = Array.isArray(config.args)
    ? config.args.filter((arg): arg is string => typeof arg === "string")
    : [];
  return {
    name,
    transport,
    command: typeof config.command === "string" ? config.command : "",
    args: joinArgs(args),
    env: stringRecordRows(config.env),
    url: typeof config.url === "string" ? config.url : "",
    headers: bearer
      ? headerRows.filter((row) => row !== authorization)
      : headerRows,
    authMode: bearer ? "bearer" : "oauth",
    bearerToken: bearer?.[1] ?? "",
    enabled: config.enabled !== false,
    exposure: isExposure(config.exposure) ? config.exposure : "codemode",
    oauthClientId: typeof oauth.clientId === "string" ? oauth.clientId : "",
    oauthClientSecret:
      typeof oauth.clientSecret === "string" ? oauth.clientSecret : "",
    oauthCallbackPort:
      typeof oauth.callbackPort === "number" ? String(oauth.callbackPort) : "",
    rest: Object.fromEntries(
      Object.entries(config).filter(([key]) => !FORM_KEYS.includes(key)),
    ),
  };
}

export function createServerForm(name: string): McpServerForm {
  return serverConfigToForm(name, { command: "" });
}

function oauthConfig(form: McpServerForm, original: unknown) {
  const { clientId, clientSecret, callbackPort, ...other } = isRecord(original)
    ? original
    : {};
  const port = form.oauthCallbackPort.trim();
  const oauth: Record<string, unknown> = {
    ...other,
    ...(form.oauthClientId.trim()
      ? { clientId: form.oauthClientId.trim() }
      : {}),
    ...(form.oauthClientSecret ? { clientSecret: form.oauthClientSecret } : {}),
    ...(port ? { callbackPort: Number(port) } : {}),
  };
  return Object.keys(oauth).length > 0 ? oauth : undefined;
}

export function serverFormToConfig(
  form: McpServerForm,
  original: McpServerConfig = {},
): McpServerConfig {
  const config: McpServerConfig = {};
  if (form.transport === "stdio") {
    config.command = form.command.trim();
    const args = splitArgs(form.args);
    if (args.length > 0) config.args = args;
    const env = rowsToRecord(form.env);
    if (Object.keys(env).length > 0) config.env = env;
  } else {
    config.url = form.url.trim();
    const headers = rowsToRecord(form.headers);
    const token = form.bearerToken.trim();
    if (form.authMode === "bearer" && token) {
      for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === "authorization") delete headers[key];
      }
      headers.Authorization = `Bearer ${token}`;
    }
    if (Object.keys(headers).length > 0) config.headers = headers;
    const oauth = oauthConfig(form, original.oauth);
    if (oauth) config.oauth = oauth;
  }
  if (form.exposure !== "codemode") config.exposure = form.exposure;
  if (!form.enabled) config.enabled = false;
  const foreignKeys =
    form.transport === "stdio" ? HTTP_ONLY_KEYS : STDIO_ONLY_KEYS;
  const rest = Object.fromEntries(
    Object.entries(form.rest).filter(([key]) => !foreignKeys.includes(key)),
  );
  return { ...config, ...rest };
}

function isHttpUrl(value: string) {
  return URL.canParse(value) && /^https?:$/.test(new URL(value).protocol);
}

export function validateServerForm(
  form: McpServerForm,
  otherNames: string[],
): McpFormError | null {
  const name = form.name.trim();
  if (!name) return "nameRequired";
  if (!isValidMcpServerName(name)) return "nameInvalid";
  if (otherNames.includes(name)) return "nameTaken";
  if (form.transport === "stdio" && !form.command.trim()) {
    return "commandRequired";
  }
  if (form.transport === "http" && !form.url.trim()) return "urlRequired";
  if (form.transport === "http" && !isHttpUrl(form.url.trim())) {
    return "urlInvalid";
  }
  const port = form.oauthCallbackPort.trim();
  if (
    form.transport === "http" &&
    port &&
    !(/^\d+$/.test(port) && Number(port) > 0 && Number(port) < 65536)
  ) {
    return "callbackPortInvalid";
  }
  return null;
}

export function nextServerName(names: string[]) {
  let index = names.length + 1;
  while (names.includes(`server-${index}`)) index += 1;
  return `server-${index}`;
}

export function parseServersFromConfigText(content: string) {
  const parsed = JSON.parse(content) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.mcpServers)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(parsed.mcpServers).filter(
      (entry): entry is [string, McpServerConfig] => isRecord(entry[1]),
    ),
  );
}
