import type {
  AgentToolCallerContext,
  CreateScriptRunPayload,
  ScriptRunRecord,
} from "@cocurdex/shared";
import type { AgentToolRegistry } from "../tool-registry";

export interface ScriptRunToolDependencies {
  create(payload: CreateScriptRunPayload): Promise<ScriptRunRecord>;
}

const isMainSession = (caller: AgentToolCallerContext) =>
  caller.sessionKind === "main";

const PROPOSE_DESCRIPTION = [
  "Propose a JavaScript script that orchestrates subagents in the background. The user reviews the script and must approve it before it runs; the run's result is delivered back to this session as a message when it finishes.",
  "The script body is plain JavaScript with top-level await and return. It cannot import modules or touch the filesystem, network, or shell; only subagents do real work. Available functions:",
  "- agent(prompt, options?) runs one subagent with its own fresh context and resolves to its final reply text, or null if it failed or was cancelled. options: { label?: string, agentRoleId?: string, worktree?: boolean, schema?: JSON Schema }. With schema, the reply is parsed and validated as JSON and resolves to the parsed value. Use worktree: true for agents that edit files in parallel.",
  "- parallel(tasks) runs an array of functions returning promises concurrently and resolves to their results in order.",
  "- pipeline(items, fn) calls fn(item) for every item concurrently and resolves to results in item order, keeping null entries.",
  "- log(...values) records a progress message.",
  "Lists passed to parallel or pipeline may hold at most 4096 items, and each run has a user-approved agent limit, so keep fan-out proportional to the task. Subagents inherit this session's agent, model, and permissions unless agentRoleId selects a saved role.",
].join("\n");

export function registerScriptRunTools(
  registry: AgentToolRegistry,
  deps: ScriptRunToolDependencies,
) {
  registry.register({
    descriptor: {
      group: "script_run",
      name: "propose",
      description: PROPOSE_DESCRIPTION,
      inputSchema: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description:
              "Short kebab-case name, lowercase letters, digits, and hyphens",
          },
          script: { type: "string", description: "Script body" },
        },
        required: ["name", "script"],
        additionalProperties: false,
      },
    },
    isAvailable: isMainSession,
    execute: async (caller, input) => {
      const run = await deps.create({
        requesterSessionId: caller.sessionId,
        name: String(input.name),
        script: String(input.script),
      });
      return {
        runId: run.id,
        status: run.status,
        maxAgents: run.maxAgents,
        note: "Waiting for the user to approve the script. Do not poll; the result arrives as a message.",
      };
    },
  });
}
