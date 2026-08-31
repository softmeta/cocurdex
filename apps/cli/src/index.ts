#!/usr/bin/env node
import { access } from "node:fs/promises";
import path from "node:path";
import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import type {
  AgentId,
  AgentProviderSnapshot,
  ProviderConfigRecord,
  ProviderModelRecord,
  SessionRecord,
  WorkflowAggregate,
  WorkflowExecutorBindings,
  WorkspaceRecord,
} from "@cocurdex/shared";
import { withDaemon } from "./daemon-command";
import { handleIssueCommand } from "./issue-commands";
import { handleNoteCommand } from "./note-commands";
import {
  assertDirectory,
  openDesktopApp,
  resolveOpenFolderArg,
  shouldHandleAsOpen,
} from "./open-desktop";
import {
  getRequiredFlag,
  type ParsedArgs,
  parseArgs,
  printResult,
  printRows,
  stringFlag,
} from "./parse-args";
import { handleSearchCommand } from "./search-commands";
import { assertSessionTuiAvailable, runSessionTui } from "./session-tui";
import { handleSkillsCommand, skillsUsageLines } from "./skill-commands";
import { getCliVersion } from "./version";
import { assertWorkflowTuiAvailable, runWorkflowTui } from "./workflow-tui";

const [, , ...argv] = process.argv;

main(argv).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Unknown CLI error");
  process.exitCode = 1;
});

async function main(rawArgs: string[]) {
  const parsed = parseArgs(rawArgs);
  const [resource, action, ...args] = parsed.args;

  if (parsed.flags.has("help") || resource === "help" || resource === "-h") {
    printUsage();
    return;
  }

  if (
    parsed.flags.has("version") ||
    resource === "version" ||
    resource === "-v" ||
    resource === "-V"
  ) {
    printVersion(parsed);
    return;
  }

  // VS Code-style: `cocurdex`, `cocurdex .`, `cocurdex open <path>`
  if (shouldHandleAsOpen(resource)) {
    const folderArg = resolveOpenFolderArg(resource, action);
    const folderPath =
      folderArg === undefined ? undefined : await assertDirectory(folderArg);
    await openDesktopApp(folderPath);
    return;
  }

  if (resource === "issue") {
    const handled = await handleIssueCommand(action, args, parsed);
    if (handled) {
      return;
    }
  }

  if (resource === "note") {
    const handled = await handleNoteCommand(action, args, parsed);
    if (handled) {
      return;
    }
  }

  if (resource === "search") {
    await handleSearchCommand(
      [action, ...args].filter(Boolean) as string[],
      parsed,
    );
    return;
  }

  if (resource === "skills" || resource === "skill") {
    const handled = await handleSkillsCommand(action, args, parsed);
    if (handled) {
      return;
    }
  }

  if (resource === "daemon" && action === "status") {
    const status = await withDaemon(() => requestDaemon("daemon.status"));
    printResult(status, parsed);
    return;
  }

  if (resource === "workspace" && action === "list") {
    const workspaces = await withDaemon(() => requestDaemon("workspace.list"));
    printRows(workspaces, ["id", "name", "rootPath"], parsed);
    return;
  }

  if (resource === "session" && action === "list") {
    const sessions = await withDaemon(() => requestDaemon("session.list"));
    printRows(sessions, ["id", "title", "agentType", "status"], parsed);
    return;
  }

  if (resource === "session" && action === "create") {
    const session = await createSession(parsed);
    printResult(session, parsed);
    return;
  }

  if (resource === "session" && action === "tui") {
    if (parsed.flags.has("json")) {
      throw new Error("Session TUI does not support --json.");
    }

    assertSessionTuiAvailable();
    const session = await resolveSessionTuiSession(args[0], parsed);
    const workspaces = await withDaemon(() => requestDaemon("workspace.list"));
    const workspace = workspaces.find(
      (candidate) => candidate.id === session.workspaceId,
    );
    if (!workspace) {
      throw new Error("Session workspace not found");
    }

    await runSessionTui(session.id, {
      getSnapshot: () =>
        requestDaemon("session.snapshot", { sessionId: session.id }),
      subscribe: (onEvent, onDisconnect) =>
        subscribeDaemonEvents(
          (event) => {
            if (event.type !== "data.changed") onEvent(event);
          },
          { onDisconnect },
        ),
      send: (currentSession, content, delivery) =>
        requestDaemon("session.send", {
          message: {
            session: { ...currentSession, status: "running" },
            workspaceRootPath: workspace.rootPath,
            content,
            delivery,
          },
          providerConfig: null,
        }),
      stop: async () => {
        await requestDaemon("session.stop", { sessionId: session.id });
      },
      resolvePermission: async (requestId, decision) => {
        const resolved = await requestDaemon("permission.resolve", {
          requestId,
          decision,
        });
        if (!resolved)
          throw new Error("Permission request is no longer pending.");
      },
      answerQuestion: async (questionId, answer) => {
        const resolved = await requestDaemon("question.resolve", {
          questionId,
          answer,
        });
        if (!resolved) throw new Error("Question is no longer pending.");
      },
      resolvePlanApproval: async (approvalId, decision) => {
        const resolved = await requestDaemon("planApproval.resolve", {
          approvalId,
          decision,
        });
        if (!resolved) throw new Error("Plan approval is no longer pending.");
      },
    });
    return;
  }

  if (resource === "session" && action === "send") {
    const [sessionId, prompt] = args;

    if (!sessionId || !prompt) {
      throw new Error("Usage: cocurdex session send <session-id> <prompt>");
    }

    const message = await sendSessionMessage(sessionId, prompt);
    printResult(message, parsed);
    return;
  }

  if (resource === "session" && action === "stop") {
    const [sessionId] = args;

    if (!sessionId) {
      throw new Error("Usage: cocurdex session stop <session-id>");
    }

    await withDaemon(() => requestDaemon("session.stop", { sessionId }));
    printResult({ stopped: true, sessionId }, parsed);
    return;
  }

  if (resource === "provider" && action === "list") {
    const providers = await withDaemon(() =>
      requestDaemon("provider.listConfigs"),
    );
    printRows(providers, ["id", "name", "baseUrl", "enabled"], parsed);
    return;
  }

  if (resource === "provider" && action === "models") {
    const [providerId] = args;
    const result = await withDaemon(() =>
      requestDaemon("provider.listModels", { providerId }),
    );
    printRows(result.models, ["providerId", "modelId", "name", "api"], parsed);
    return;
  }

  if (resource === "workflow" && action === "list") {
    const runs = await withDaemon(() => requestDaemon("workflow.list"));
    printRows(
      runs,
      ["id", "definitionId", "definitionVersion", "status", "createdAt"],
      parsed,
    );
    return;
  }

  if (resource === "workflow" && action === "tui") {
    if (parsed.flags.has("json")) {
      throw new Error("Workflow TUI does not support --json.");
    }

    assertWorkflowTuiAvailable();
    const aggregate = await resolveWorkflowTuiRun(args[0], parsed);
    const workflowRunId = aggregate.run.id;
    await runWorkflowTui(aggregate, {
      get: () => requestDaemon("workflow.get", { workflowRunId }),
      start: () => requestDaemon("workflow.start", { workflowRunId }),
      decideGate: (stepId, decision) =>
        requestDaemon("workflow.decideGate", {
          workflowRunId,
          stepId,
          decision,
          actor: "user",
        }),
      cancel: () => requestDaemon("workflow.cancel", { workflowRunId }),
    });
    return;
  }

  if (resource === "workflow" && (action === "show" || action === "get")) {
    const [workflowRunId] = args;

    if (!workflowRunId) {
      throw new Error("Usage: cocurdex workflow show <run-id>");
    }

    const aggregate = await withDaemon(() =>
      requestDaemon("workflow.get", { workflowRunId }),
    );

    if (!aggregate) {
      throw new Error("Workflow run not found");
    }

    printWorkflow(aggregate, parsed);
    return;
  }

  if (resource === "workflow" && action === "create") {
    const aggregate = await createWorkflow(parsed);
    printWorkflow(aggregate, parsed);
    return;
  }

  if (resource === "workflow" && action === "start") {
    const [workflowRunId] = args;

    if (!workflowRunId) {
      throw new Error("Usage: cocurdex workflow start <run-id>");
    }

    const aggregate = await withDaemon(() =>
      requestDaemon("workflow.start", { workflowRunId }),
    );
    printWorkflow(aggregate, parsed);
    return;
  }

  if (
    resource === "workflow" &&
    (action === "approve" || action === "reject")
  ) {
    const [workflowRunId] = args;

    if (!workflowRunId) {
      throw new Error(`Usage: cocurdex workflow ${action} <run-id>`);
    }

    const aggregate = await withDaemon(() =>
      requestDaemon("workflow.decideGate", {
        workflowRunId,
        stepId: stringFlag(parsed, "step") ?? "approve_plan",
        decision: action === "approve" ? "approved" : "rejected",
        reason: stringFlag(parsed, "reason"),
      }),
    );
    printWorkflow(aggregate, parsed);
    return;
  }

  if (resource === "workflow" && action === "cancel") {
    const [workflowRunId] = args;

    if (!workflowRunId) {
      throw new Error("Usage: cocurdex workflow cancel <run-id>");
    }

    const aggregate = await withDaemon(() =>
      requestDaemon("workflow.cancel", { workflowRunId }),
    );
    printWorkflow(aggregate, parsed);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

function printVersion(parsed: ParsedArgs) {
  const version = getCliVersion();
  if (parsed.flags.has("json")) {
    printResult({ version }, parsed);
    return;
  }
  console.log(`cocurdex ${version}`);
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  cocurdex [path]                         Open folder in desktop app (like code .)",
      "  cocurdex open [path]                    Same as above",
      "  cocurdex --version | -v | version       Print CLI version",
      "  cocurdex note list|show|create|update|delete|backlinks|tags [--json]",
      "  cocurdex issue list|show|create|move|delete|views [--view <id>] [--json]",
      "  cocurdex search <query> [--kind note|issue] [--workspace <id>] [--json]",
      ...skillsUsageLines(),
      "  cocurdex daemon status",
      "  cocurdex workspace list",
      "  cocurdex session list",
      "  cocurdex session create --workspace <id|path> --agent <agent> --provider <provider> --model <model>",
      "  cocurdex session tui [session-id]",
      "  cocurdex session tui --workspace <id|path> --agent <agent> --provider <provider> --model <model>",
      "  cocurdex session send <session-id> <prompt>",
      "  cocurdex session stop <session-id>",
      "  cocurdex provider list",
      "  cocurdex provider models <provider>",
      "  cocurdex workflow list",
      "  cocurdex workflow tui [run-id]",
      "  cocurdex workflow tui --workspace <id|path> --prompt <prompt> [--planner codex] [--implementer grok-build] [--reviewer codex]",
      "  cocurdex workflow create --workspace <id|path> --prompt <prompt> [--planner codex] [--implementer grok-build] [--reviewer codex]",
      "  cocurdex workflow show <run-id>",
      "  cocurdex workflow start <run-id>",
      "  cocurdex workflow approve|reject <run-id> [--reason <text>]",
      "  cocurdex workflow cancel <run-id>",
    ].join("\n"),
  );
}

async function createSession(parsed: ParsedArgs) {
  const workspaceValue = getRequiredFlag(parsed, "workspace");
  const agentType = getRequiredFlag(parsed, "agent") as AgentId;
  const providerId = getRequiredFlag(parsed, "provider");
  const modelId = getRequiredFlag(parsed, "model");
  const [workspaces, providers, models] = await withDaemon(async () =>
    Promise.all([
      requestDaemon("workspace.list"),
      requestDaemon("provider.listConfigs"),
      requestDaemon("provider.listModels", { providerId }),
    ]),
  );
  const workspace = workspaces.find(
    (item) => item.id === workspaceValue || item.rootPath === workspaceValue,
  );

  if (!workspace) {
    await access(workspaceValue);
  }

  const provider = providers.find((item) => item.id === providerId);
  const model = models.models.find((item) => item.modelId === modelId);

  if (!provider || !model) {
    throw new Error("Provider or model not found");
  }

  const now = new Date().toISOString();
  const targetWorkspace =
    workspace ??
    createWorkspaceFromPath(
      path.resolve(workspaceValue),
      now,
      workspaces.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1000,
    );
  const session: SessionRecord = {
    id: crypto.randomUUID(),
    workspaceId: targetWorkspace.id,
    title: `New ${agentType} session`,
    agentType,
    status: "idle",
    writeMode: "native-write",
    collaborationMode: "default",
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    providerSnapshot: createProviderSnapshot(provider, model),
  };

  await withDaemon(async () => {
    if (!workspace) {
      await requestDaemon("workspace.save", { workspace: targetWorkspace });
    }
    return requestDaemon("session.create", {
      session,
      workspaceRootPath: targetWorkspace.rootPath,
    });
  });

  return session;
}

async function resolveSessionTuiSession(
  sessionId: string | undefined,
  parsed: ParsedArgs,
) {
  if (sessionId) {
    const sessions = await withDaemon(() => requestDaemon("session.list"));
    const session = sessions.find((candidate) => candidate.id === sessionId);
    if (!session) throw new Error("Session not found");
    return session;
  }

  const shouldCreate = ["workspace", "agent", "provider", "model"].some(
    (flag) => parsed.flags.has(flag),
  );
  if (shouldCreate) return createSession(parsed);

  const sessions = await withDaemon(() => requestDaemon("session.list"));
  const latest = [...sessions]
    .filter((session) => !session.archivedAt)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))[0];
  if (!latest) {
    throw new Error(
      "No session found. Create one with cocurdex session tui --workspace ... --agent ... --provider ... --model ...",
    );
  }
  return latest;
}

async function sendSessionMessage(sessionId: string, prompt: string) {
  const [sessions, workspaces] = await withDaemon(async () =>
    Promise.all([
      requestDaemon("session.list"),
      requestDaemon("workspace.list"),
    ]),
  );
  const session = sessions.find((item) => item.id === sessionId);

  if (!session) {
    throw new Error("Session not found");
  }

  const workspace = workspaces.find((item) => item.id === session.workspaceId);

  if (!workspace) {
    throw new Error("Session workspace not found");
  }

  return withDaemon(() =>
    requestDaemon("session.send", {
      message: {
        session: { ...session, status: "running" },
        workspaceRootPath: workspace.rootPath,
        content: prompt,
      },
      providerConfig: null,
    }),
  );
}

async function createWorkflow(parsed: ParsedArgs) {
  const workspaceValue = getRequiredFlag(parsed, "workspace");
  const prompt = getRequiredFlag(parsed, "prompt");
  const bindings: WorkflowExecutorBindings = {
    planner: workflowBinding(parsed, "planner", "codex", "read_only"),
    implementer: workflowBinding(
      parsed,
      "implementer",
      "grok-build",
      "workspace_write",
    ),
    reviewer: workflowBinding(parsed, "reviewer", "codex", "read_only"),
  };
  const [workspaces] = await withDaemon(async () =>
    Promise.all([requestDaemon("workspace.list")]),
  );
  const workspace = workspaces.find(
    (item) => item.id === workspaceValue || item.rootPath === workspaceValue,
  );

  if (!workspace) {
    await access(workspaceValue);
  }

  const now = new Date().toISOString();
  const targetWorkspace =
    workspace ??
    createWorkspaceFromPath(
      path.resolve(workspaceValue),
      now,
      workspaces.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1000,
    );

  return withDaemon(async () => {
    if (!workspace) {
      await requestDaemon("workspace.save", { workspace: targetWorkspace });
    }

    return requestDaemon("workflow.create", {
      workspaceId: targetWorkspace.id,
      workspaceRootPath: targetWorkspace.rootPath,
      prompt,
      bindings,
    });
  });
}

async function resolveWorkflowTuiRun(
  workflowRunId: string | undefined,
  parsed: ParsedArgs,
) {
  if (workflowRunId) {
    const aggregate = await withDaemon(() =>
      requestDaemon("workflow.get", { workflowRunId }),
    );
    if (!aggregate) throw new Error("Workflow run not found");
    return aggregate;
  }

  const shouldCreate =
    parsed.flags.has("workspace") || parsed.flags.has("prompt");
  if (shouldCreate) {
    const created = await createWorkflow(parsed);
    return withDaemon(() =>
      requestDaemon("workflow.start", { workflowRunId: created.run.id }),
    );
  }

  const runs = await withDaemon(() => requestDaemon("workflow.list"));
  const latestRun = [...runs].sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt),
  )[0];
  if (!latestRun) {
    throw new Error(
      "No workflow runs found. Pass --workspace and --prompt to create one.",
    );
  }

  const aggregate = await requestDaemon("workflow.get", {
    workflowRunId: latestRun.id,
  });
  if (!aggregate) throw new Error("Latest workflow run not found");
  return aggregate;
}

function workflowBinding(
  parsed: ParsedArgs,
  role: "planner" | "implementer" | "reviewer",
  defaultAgentId: AgentId,
  permissionProfile: "read_only" | "workspace_write",
) {
  const model = stringFlag(parsed, `${role}-model`);
  return {
    agentId: (stringFlag(parsed, role) ?? defaultAgentId) as AgentId,
    ...(model ? { model } : {}),
    permissionProfile,
  };
}

function createWorkspaceFromPath(
  rootPath: string,
  now: string,
  sortOrder: number,
): WorkspaceRecord {
  return {
    id: crypto.randomUUID(),
    name: path.basename(rootPath),
    rootPath,
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder,
  };
}

function createProviderSnapshot(
  provider: ProviderConfigRecord,
  model: ProviderModelRecord,
): AgentProviderSnapshot {
  return {
    providerId: provider.id,
    providerName: provider.name,
    modelId: model.modelId,
    modelName: model.name,
    api: model.api,
    baseUrl: provider.baseUrl,
    headersJson: provider.headersJson,
    reasoningEffort: model.defaultReasoningEffort,
  };
}

function printWorkflow(aggregate: WorkflowAggregate, parsed: ParsedArgs) {
  if (parsed.flags.has("json")) {
    printResult(aggregate, parsed);
    return;
  }

  const { run } = aggregate;
  console.log(`id: ${run.id}`);
  console.log(`definition: ${run.definitionId}@${run.definitionVersion}`);
  console.log(`status: ${run.status}`);
  console.log(`currentStepId: ${run.currentStepId ?? "none"}`);
  console.log(`workspaceRootPath: ${run.workspaceRootPath}`);
  console.log(`createdAt: ${run.createdAt}`);
  console.log("steps:");
  for (const step of aggregate.steps) {
    console.log(
      [
        `  ${step.stepId}`,
        step.kind,
        step.role ?? "system",
        step.status,
        `attempts=${step.attemptCount}`,
      ].join("  "),
    );
  }
}
