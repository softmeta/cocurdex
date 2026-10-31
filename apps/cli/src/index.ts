#!/usr/bin/env node
import { access } from "node:fs/promises";
import path from "node:path";
import { requestDaemon, subscribeDaemonEvents } from "@cocurdex/daemon/client";
import {
  type AgentId,
  type AgentPermissionMode,
  isChatWorkspaceId,
  primaryWorkspaceRootPath,
  projectAgentRoleToExecutorBinding,
  type WorkflowAggregate,
  type WorkflowExecutorBinding,
  type WorkflowExecutorBindings,
  type WorkflowRole,
  type WorkspaceRecord,
} from "@cocurdex/shared";
import { agentAuthUsageLines, handleAgentCommand } from "./agent-auth-commands";
import { withDaemon } from "./daemon-command";
import { handleDeckCommand } from "./deck-commands";
import {
  diagnosticsUsageLines,
  handleDaemonHealthCommand,
  handleDiagnosticsCommand,
} from "./diagnostics-commands";
import { handleHostCommand, hostUsageLines } from "./host-commands";
import { handleImageCommand, imageUsageLines } from "./image-commands";
import { handleIssueCommand } from "./issue-commands";
import { handleLinkCommand } from "./link-commands";
import { handleMcpCommand, mcpUsageLines } from "./mcp-commands";
import { handleMemoryCommand, memoryUsageLines } from "./memory-commands";
import { handleNoteCommand } from "./note-commands";
import {
  assertDirectory,
  isExistingDirectory,
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
import { handleProviderCommand, providerUsageLines } from "./provider-commands";
import {
  handleScriptRunCommand,
  scriptRunUsageLines,
} from "./script-run-commands";
import { handleSearchCommand } from "./search-commands";
import {
  handleSessionLineageCommand,
  sessionLineageUsageLines,
} from "./session-lineage-commands";
import {
  handleSessionRuntimeCommand,
  modelSelectionFromFlags,
  sessionRuntimeUsageLines,
} from "./session-runtime-commands";
import {
  handleSessionTreeCommand,
  sessionTreeUsageLines,
} from "./session-tree-command";
import { assertSessionTuiAvailable, runSessionTui } from "./session-tui";
import { handleSkillsCommand, skillsUsageLines } from "./skill-commands";
import { taskApi } from "./task-client";
import { handleTeamCommand, teamUsageLines } from "./team-commands";
import { getCliVersion } from "./version";
import { handleWebCommand, webUsageLines } from "./web-command";
import { assertWorkflowTuiAvailable, runWorkflowTui } from "./workflow-tui";
import { handleWorktreeCommand, worktreeUsageLines } from "./worktree-commands";

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

  if (resource === "memory") {
    const handled = await handleMemoryCommand(action, args, parsed);
    if (handled) {
      return;
    }
  }

  if (resource === "image") {
    const handled = await handleImageCommand(action, args, parsed);
    if (handled) {
      return;
    }
  }

  if (resource === "link") {
    const handled = await handleLinkCommand(action, args, parsed);
    if (handled) {
      return;
    }
  }

  if (resource === "deck") {
    const handled = await handleDeckCommand(action, args, parsed);
    if (handled) {
      return;
    }
  }

  if (resource === "team") {
    const handled = await handleTeamCommand(action, parsed);
    if (handled) {
      return;
    }
  }

  if (resource === "script-run") {
    const handled = await handleScriptRunCommand(action, parsed);
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

  if (resource === "web") {
    await handleWebCommand(parsed);
    return;
  }

  if (resource === "host") {
    const handled = await handleHostCommand(action, args, parsed);
    if (handled) {
      return;
    }
  }

  if (resource === "daemon" && action === "status") {
    const status = await withDaemon(() => requestDaemon("daemon.status"));
    printResult(status, parsed);
    return;
  }

  if (resource === "daemon" && action === "health") {
    await handleDaemonHealthCommand(parsed);
    return;
  }

  if (resource === "agent") {
    const handled = await handleAgentCommand(action, args, parsed);
    if (handled) {
      return;
    }
  }

  if (resource === "diagnostics") {
    const handled = await handleDiagnosticsCommand(action, args, parsed);
    if (handled) {
      return;
    }
  }

  if (resource === "worktree") {
    const handled = await handleWorktreeCommand(action, args, parsed);
    if (handled) {
      return;
    }
  }

  if (resource === "workspace" && action === "list") {
    const workspaces = await withDaemon(() => requestDaemon("workspace.list"));
    printRows(
      workspaces
        .filter((workspace) => !isChatWorkspaceId(workspace.id))
        .map((workspace) => ({
          ...workspace,
          rootPaths: workspace.rootPaths.join(", "),
        })),
      ["id", "name", "rootPaths"],
      parsed,
    );
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
            if ("sessionId" in event) onEvent(event);
          },
          { onDisconnect },
        ),
      send: (currentSession, content, delivery) =>
        taskApi.sendMessage({
          sessionId: currentSession.id,
          messageId: crypto.randomUUID(),
          content,
          delivery,
        }),
      stop: async () => {
        await requestDaemon("session.stop", { sessionId: session.id });
      },
      resolvePermission: async (requestId, optionId) => {
        const resolved = await requestDaemon("permission.resolve", {
          requestId,
          optionId,
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

  if (
    resource === "session" &&
    ((await handleSessionLineageCommand(action, args, parsed)) ||
      (await handleSessionRuntimeCommand(action, args, parsed)))
  ) {
    return;
  }

  if (resource === "session" && action === "tree") {
    await handleSessionTreeCommand(args[0], parsed);
    return;
  }

  if (resource === "session" && action === "peers") {
    const [sessionId] = args;
    if (!sessionId) {
      throw new Error("Usage: cocurdex session peers <session-id>");
    }
    const peers = await withDaemon(() =>
      requestDaemon("session.listPeers", { sessionId }),
    );
    printRows(peers, ["sessionId", "title", "agentType", "status"], parsed);
    return;
  }

  if (resource === "session" && action === "send-peer") {
    const [fromSessionId, toSessionId, content] = args;
    if (!fromSessionId || !toSessionId || !content) {
      throw new Error(
        "Usage: cocurdex session send-peer <from-session-id> <to-session-id> <message>",
      );
    }
    const result = await withDaemon(() =>
      requestDaemon("session.sendPeerMessage", {
        fromSessionId,
        toSessionId,
        content,
      }),
    );
    printResult(result, parsed);
    return;
  }

  if (resource === "session" && action === "peer-inbound") {
    const [sessionId, policy] = args;
    if (!sessionId || (policy !== "deliver" && policy !== "refuse")) {
      throw new Error(
        "Usage: cocurdex session peer-inbound <session-id> deliver|refuse",
      );
    }
    const session = await withDaemon(() =>
      requestDaemon("session.setPeerInbound", { sessionId, policy }),
    );
    printResult(session, parsed);
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

  if (resource === "mcp") {
    const handled = await handleMcpCommand(
      rawArgs.slice(rawArgs.indexOf("mcp") + 1),
    );
    if (handled) {
      return;
    }
  }

  if (resource === "provider") {
    const handled = await handleProviderCommand(action, args, parsed);
    if (handled) {
      return;
    }
  }

  if (resource === "role" && (action === "list" || action === undefined)) {
    const roles = await withDaemon(() => requestDaemon("agentRole.list"));
    printRows(roles, ["id", "name", "agentId", "updatedAt"], parsed);
    return;
  }

  if (resource === "workflow" && action === "definitions") {
    const definitions = await withDaemon(() =>
      requestDaemon("workflow.listDefinitions"),
    );
    printResult(definitions, parsed);
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

  if (
    resource &&
    action === undefined &&
    (await isExistingDirectory(resource))
  ) {
    await openDesktopApp(await assertDirectory(resource));
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
      "  cocurdex note list|show|create|update|move|delete|backlinks|tags [--json]",
      "  cocurdex note create|update ... [--body <markdown> | --body - | --body-file <path>]",
      ...memoryUsageLines(),
      "  cocurdex note update <id> ... [--expected-revision <n>]",
      ...imageUsageLines(),
      "  cocurdex link list <ref> [--json]",
      "  cocurdex link add|remove <ref> <ref>   (ref: <kind>:<id> or cocurdex://<kind>/<id>; kind session|note|issue|deck)",
      "  cocurdex deck list|show|create|update|delete|check [--json]",
      "  cocurdex deck create|update ... [--title <t>] [--markdown-file <path|-> | --content-file <path|->]",
      "  cocurdex deck update <id> ... [--expected-revision <n>]",
      "  cocurdex deck edit <id> --ops-file <path|-> [--expected-revision <n>]",
      "  cocurdex deck image <id> --slide <slideId> --file <path.png|path.jpg> [--alt <text>] [--replace <elementId>]",
      "  cocurdex deck export <id> --output <path.pptx|path.pdf> [--format pptx|pdf]",
      "  cocurdex deck import <file.pptx> [--title <t>] [--workspace <id>] [--json]",
      "  cocurdex deck read <file.pptx> [--json]",
      "  cocurdex issue list|show|create|update|move|delete|comment|views [--view <id>] [--json]",
      "  cocurdex issue relate|unrelate <id> blocks|related|duplicate <id> [--json]",
      "  cocurdex issue labels | label create --name <name> | label update <id|name> [--name <name>] [--color <color>] | label delete <id|name> [--json]",
      "  cocurdex search <query> [--kind note|issue] [--workspace <id>] [--json]",
      ...skillsUsageLines(),
      ...diagnosticsUsageLines(),
      ...webUsageLines(),
      ...hostUsageLines(),
      ...worktreeUsageLines(),
      "  cocurdex workspace list",
      "  cocurdex session list",
      "  cocurdex session create --workspace <id|path> [--agent <agent>] [--provider <provider> --model <model>] [--permission <mode>] [--role <role-id>] [--title <title>]",
      "  cocurdex session tui [session-id]",
      "  cocurdex session tui --workspace <id|path> --agent <agent> --provider <provider> --model <model>",
      "  cocurdex session send <session-id> <prompt>",
      ...sessionTreeUsageLines(),
      ...sessionLineageUsageLines(),
      ...sessionRuntimeUsageLines(),
      "  cocurdex session peers <session-id>",
      "  cocurdex session send-peer <from-session-id> <to-session-id> <message>",
      "  cocurdex session peer-inbound <session-id> deliver|refuse",
      "  cocurdex session stop <session-id>",
      ...teamUsageLines(),
      ...scriptRunUsageLines(),
      ...providerUsageLines(),
      ...agentAuthUsageLines(),
      ...mcpUsageLines(),
      "  cocurdex workflow list",
      "  cocurdex workflow definitions",
      "  cocurdex workflow tui [run-id]",
      "  cocurdex role list",
      "  cocurdex workflow tui --workspace <id|path> --prompt <prompt> [--planner codex] [--implementer grok-build] [--reviewer codex] [--planner-role <id>] [--implementer-role <id>] [--reviewer-role <id>]",
      "  cocurdex workflow create --workspace <id|path> --prompt <prompt> [--definition <id>] [--planner codex] [--implementer grok-build] [--reviewer codex] [--planner-role <id>] [--implementer-role <id>] [--reviewer-role <id>]",
      "  cocurdex workflow show <run-id>",
      "  cocurdex workflow start <run-id>",
      "  cocurdex workflow approve|reject <run-id> [--reason <text>]",
      "  cocurdex workflow cancel <run-id>",
    ].join("\n"),
  );
}

async function createSession(parsed: ParsedArgs) {
  const workspaceValue = getRequiredFlag(parsed, "workspace");
  const workspaces = await withDaemon(() => requestDaemon("workspace.list"));
  const workspace = workspaces.find(
    (item) =>
      item.id === workspaceValue || item.rootPaths.includes(workspaceValue),
  );

  if (!workspace) {
    await access(workspaceValue);
  }

  const targetWorkspace =
    workspace ??
    createWorkspaceFromPath(
      path.resolve(workspaceValue),
      new Date().toISOString(),
      workspaces.reduce((max, item) => Math.max(max, item.sortOrder), 0) + 1000,
    );

  return withDaemon(async () => {
    if (!workspace) {
      await requestDaemon("workspace.save", { workspace: targetWorkspace });
    }
    return requestDaemon("session.create", {
      workspaceId: targetWorkspace.id,
      agentType: stringFlag(parsed, "agent") as AgentId | undefined,
      model: modelSelectionFromFlags(parsed),
      permissionMode: stringFlag(parsed, "permission") as
        | AgentPermissionMode
        | undefined,
      agentRoleId: stringFlag(parsed, "role"),
      title: stringFlag(parsed, "title"),
    });
  });
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
  return withDaemon(() =>
    taskApi.sendMessage({
      sessionId,
      messageId: crypto.randomUUID(),
      content: prompt,
    }),
  );
}

async function createWorkflow(parsed: ParsedArgs) {
  const workspaceValue = getRequiredFlag(parsed, "workspace");
  const prompt = getRequiredFlag(parsed, "prompt");
  const [workspaces, bindings] = await withDaemon(async () =>
    Promise.all([
      requestDaemon("workspace.list"),
      resolveWorkflowBindings(parsed),
    ]),
  );
  const workspace = workspaces.find(
    (item) =>
      item.id === workspaceValue || item.rootPaths.includes(workspaceValue),
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
      workspaceRootPath: primaryWorkspaceRootPath(targetWorkspace),
      prompt,
      bindings,
      definitionId: stringFlag(parsed, "definition"),
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

async function resolveWorkflowBindings(
  parsed: ParsedArgs,
): Promise<WorkflowExecutorBindings> {
  return {
    planner: await resolveWorkflowRoleBinding(
      parsed,
      "planner",
      "codex",
      "read_only",
    ),
    implementer: await resolveWorkflowRoleBinding(
      parsed,
      "implementer",
      "acp:grok-build",
      "workspace_write",
    ),
    reviewer: await resolveWorkflowRoleBinding(
      parsed,
      "reviewer",
      "codex",
      "read_only",
    ),
  };
}

async function resolveWorkflowRoleBinding(
  parsed: ParsedArgs,
  role: WorkflowRole,
  defaultAgentId: AgentId,
  permissionProfile: "read_only" | "workspace_write",
): Promise<WorkflowExecutorBinding> {
  const roleId = stringFlag(parsed, `${role}-role`);
  if (!roleId) {
    return workflowBinding(parsed, role, defaultAgentId, permissionProfile);
  }

  const agentRole = await requestDaemon("agentRole.get", { id: roleId });
  if (!agentRole) {
    throw new Error(`Agent role '${roleId}' not found.`);
  }
  return projectAgentRoleToExecutorBinding(agentRole, role);
}

function workflowBinding(
  parsed: ParsedArgs,
  role: WorkflowRole,
  defaultAgentId: AgentId,
  permissionProfile: "read_only" | "workspace_write",
): WorkflowExecutorBinding {
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
    rootPaths: [rootPath],
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
    sortOrder,
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
