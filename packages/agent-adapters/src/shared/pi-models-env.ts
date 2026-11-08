import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const PI_AGENT_DIR_ENV = "PI_CODING_AGENT_DIR";

const ENV_VAR_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const ENV_VAR_NAME_PREFIX_RE = /^[A-Za-z_][A-Za-z0-9_]*/;

export function extractConfigValueEnvNames(value: string): string[] {
  if (value.startsWith("!")) {
    return [];
  }

  const names: string[] = [];
  const add = (name: string) => {
    if (!names.includes(name)) {
      names.push(name);
    }
  };

  let index = 0;
  while (index < value.length) {
    const dollarIndex = value.indexOf("$", index);
    if (dollarIndex < 0) {
      break;
    }

    const nextChar = value[dollarIndex + 1];

    if (nextChar === "$" || nextChar === "!") {
      index = dollarIndex + 2;
      continue;
    }

    if (nextChar === "{") {
      const endIndex = value.indexOf("}", dollarIndex + 2);
      if (endIndex < 0) {
        index = dollarIndex + 1;
        continue;
      }
      const name = value.slice(dollarIndex + 2, endIndex);
      if (ENV_VAR_NAME_RE.test(name)) {
        add(name);
      }
      index = endIndex + 1;
      continue;
    }

    const match = value.slice(dollarIndex + 1).match(ENV_VAR_NAME_PREFIX_RE);
    if (match) {
      add(match[0]);
      index = dollarIndex + 1 + match[0].length;
      continue;
    }

    index = dollarIndex + 1;
  }

  return names;
}

function expandTilde(path: string): string {
  if (path === "~") {
    return homedir();
  }
  if (path.startsWith("~/") || path.startsWith("~\\")) {
    return join(homedir(), path.slice(2));
  }
  return path;
}

function getModelsJsonPath(env: NodeJS.ProcessEnv): string {
  const agentDir = env[PI_AGENT_DIR_ENV];
  if (agentDir) {
    return join(expandTilde(agentDir), "models.json");
  }
  return join(homedir(), ".pi", "agent", "models.json");
}

function collectFromConfigField(value: unknown, into: string[]): void {
  if (typeof value !== "string") {
    return;
  }
  for (const name of extractConfigValueEnvNames(value)) {
    if (!into.includes(name)) {
      into.push(name);
    }
  }
}

function collectFromHeaders(headers: unknown, into: string[]): void {
  if (!headers || typeof headers !== "object") {
    return;
  }
  for (const value of Object.values(headers as Record<string, unknown>)) {
    collectFromConfigField(value, into);
  }
}

function collectFromAuthBearer(source: unknown, into: string[]): void {
  if (!source || typeof source !== "object") {
    return;
  }
  const record = source as Record<string, unknown>;
  collectFromConfigField(record.apiKey, into);
  collectFromHeaders(record.headers, into);
}

export function collectPiModelsEnvNames(env: NodeJS.ProcessEnv): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(getModelsJsonPath(env), "utf8"));
  } catch {
    return [];
  }

  const providers = (parsed as { providers?: unknown } | null)?.providers;
  if (!providers || typeof providers !== "object") {
    return [];
  }

  const names: string[] = [];
  for (const provider of Object.values(providers as Record<string, unknown>)) {
    collectFromAuthBearer(provider, names);
    const models = (provider as { models?: unknown } | null)?.models;
    if (Array.isArray(models)) {
      for (const model of models) {
        collectFromAuthBearer(model, names);
      }
    }
  }

  return names;
}
