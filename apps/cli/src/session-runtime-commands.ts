import { requestDaemon } from "@cocurdex/daemon/client";
import {
  type AgentThinkingLevel,
  isReasoningEffort,
  type SessionRuntimeSelection,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import { type ParsedArgs, printResult, stringFlag } from "./parse-args";

const RUNTIME_COMMAND = "cocurdex session runtime <session-id> [--json]";
const CONFIGURE_COMMAND =
  "cocurdex session configure <session-id> [--provider <id> --model <id>] [--effort <level|default>] [--thinking <level|off|default>] [--fast <on|off|default>] [--service-tier <tier|default>] [--opencode-agent <name|default>] [--opencode-variant <name|default>] [--json]";

const DEFAULT_VALUE = "default";

export function sessionRuntimeUsageLines() {
  return [`  ${RUNTIME_COMMAND}`, `  ${CONFIGURE_COMMAND}`];
}

function nullableText(parsed: ParsedArgs, flag: string) {
  const value = stringFlag(parsed, flag);
  if (value === undefined) return undefined;
  return value === DEFAULT_VALUE ? null : value;
}

function reasoningEffortFlag(parsed: ParsedArgs) {
  const value = nullableText(parsed, "effort");
  if (value === undefined || value === null) return value;
  if (!isReasoningEffort(value)) {
    throw new Error(`Unknown --effort ${value}`);
  }
  return value;
}

function thinkingLevelFlag(parsed: ParsedArgs): AgentThinkingLevel | undefined {
  const value = stringFlag(parsed, "thinking");
  if (value === undefined) return undefined;
  if (value === DEFAULT_VALUE || value === "off" || isReasoningEffort(value)) {
    return value;
  }
  throw new Error(`Unknown --thinking ${value}`);
}

const fastModeValues: Record<string, boolean | null> = {
  on: true,
  off: false,
  [DEFAULT_VALUE]: null,
};

function fastModeFlag(parsed: ParsedArgs) {
  const value = stringFlag(parsed, "fast");
  if (value === undefined) return undefined;
  if (!(value in fastModeValues)) {
    throw new Error(`Unknown --fast ${value}; use on, off, or default`);
  }
  return fastModeValues[value];
}

export function runtimeSelectionFromFlags(
  parsed: ParsedArgs,
): SessionRuntimeSelection | undefined {
  const entries = Object.entries({
    reasoningEffort: reasoningEffortFlag(parsed),
    thinkingLevel: thinkingLevelFlag(parsed),
    fastMode: fastModeFlag(parsed),
    serviceTier: nullableText(parsed, "service-tier"),
    openCodeAgent: nullableText(parsed, "opencode-agent"),
    openCodeVariant: nullableText(parsed, "opencode-variant"),
  }).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

export function modelSelectionFromFlags(parsed: ParsedArgs) {
  const providerId = stringFlag(parsed, "provider");
  const modelId = stringFlag(parsed, "model");
  if (!providerId && !modelId) return undefined;
  if (!providerId || !modelId) {
    throw new Error("--provider and --model must be given together");
  }
  return { providerId, modelId };
}

export async function handleSessionRuntimeCommand(
  action: string | undefined,
  args: string[],
  parsed: ParsedArgs,
) {
  const [sessionId] = args;
  if (action === "runtime") {
    if (!sessionId) throw new Error(`Usage: ${RUNTIME_COMMAND}`);
    const state = await withDaemon(() =>
      requestDaemon("session.runtimeState", { sessionId }),
    );
    printResult(state, parsed);
    return true;
  }
  if (action === "configure") {
    if (!sessionId) throw new Error(`Usage: ${CONFIGURE_COMMAND}`);
    const model = modelSelectionFromFlags(parsed);
    const runtime = runtimeSelectionFromFlags(parsed);
    if (!model && !runtime) throw new Error(`Usage: ${CONFIGURE_COMMAND}`);
    const session = await withDaemon(() =>
      requestDaemon("session.updateRuntime", { sessionId, model, runtime }),
    );
    printResult(session, parsed);
    return true;
  }
  return false;
}
