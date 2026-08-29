import type {
  CanUseTool,
  PermissionResult,
  PermissionUpdate,
} from "@anthropic-ai/claude-agent-sdk";
import type { CreateAgentSessionPayload } from "@cocurdex/agent-core";
import type {
  AgentPermissionRequestPayload,
  AgentPlanApprovalDecision,
  AgentQuestionOption,
  AgentToolCallLocation,
} from "@cocurdex/shared";
import { createPermissionOptions } from "../shared";

type ClaudeCanUseToolOptions = Omit<Parameters<CanUseTool>[2], "requestId"> & {
  requestId?: string;
};
type ClaudeCanUseTool = (
  toolName: string,
  input: Record<string, unknown>,
  options: ClaudeCanUseToolOptions,
) => Promise<PermissionResult>;

function getString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function getInputPath(input: Record<string, unknown>) {
  return (
    getString(input.file_path) ??
    getString(input.filePath) ??
    getString(input.path)
  );
}

function getLocations(
  input: Record<string, unknown>,
  blockedPath?: string,
): AgentToolCallLocation[] {
  const path = blockedPath ?? getInputPath(input);

  return path ? [{ path }] : [];
}

function getTitle(
  toolName: string,
  input: Record<string, unknown>,
  title?: string,
  displayName?: string,
) {
  return (
    title ??
    displayName ??
    getString(input.command) ??
    getString(input.path) ??
    toolName
  );
}

function getPersistentSuggestions(suggestions: PermissionUpdate[] | undefined) {
  if (!Array.isArray(suggestions)) {
    return [];
  }

  return suggestions.filter(
    (suggestion) => suggestion.destination === "localSettings",
  );
}

function getQuestionPrompt(input: Record<string, unknown>) {
  if (!Array.isArray(input.questions)) {
    return null;
  }

  const questions = input.questions.flatMap((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return [];
    }
    const question = value as Record<string, unknown>;
    if (typeof question.question !== "string") {
      return [];
    }
    const options = Array.isArray(question.options)
      ? question.options.flatMap((option): AgentQuestionOption[] => {
          if (!option || typeof option !== "object" || Array.isArray(option)) {
            return [];
          }
          const item = option as Record<string, unknown>;
          return typeof item.label === "string" &&
            typeof item.description === "string"
            ? [
                {
                  label: item.label,
                  description: item.description,
                  ...(typeof item.preview === "string"
                    ? { preview: item.preview }
                    : {}),
                },
              ]
            : [];
        })
      : [];

    return [
      {
        question: question.question,
        ...(typeof question.header === "string"
          ? { header: question.header }
          : {}),
        ...(options.length > 0 ? { options } : {}),
        ...(typeof question.multiSelect === "boolean"
          ? { multiSelect: question.multiSelect }
          : {}),
      },
    ];
  });

  return questions.length > 0 ? questions : null;
}

export function createClaudeCanUseTool(
  payload: CreateAgentSessionPayload,
): ClaudeCanUseTool {
  return async (toolName, input, options): Promise<PermissionResult> => {
    if (toolName === "ExitPlanMode") {
      const decision = await payload.requestPlanApproval?.({
        id: options.toolUseID,
        sessionId: payload.session.id,
        providerId: payload.session.agentType,
        planContent: getString(input.plan),
        source: getString(input.planFilePath) ? "file-backed" : "inline",
      });

      return mapPlanApprovalDecision(decision, input, options.toolUseID);
    }

    if (toolName === "AskUserQuestion") {
      const questions = getQuestionPrompt(input);
      if (!questions) {
        return {
          behavior: "deny",
          message: "Claude provided an invalid AskUserQuestion payload",
          toolUseID: options.toolUseID,
        };
      }

      const answers: Record<string, string> = {};
      for (const [index, question] of questions.entries()) {
        const answer = await payload.requestQuestion?.({
          id: `${options.toolUseID}:${index}`,
          sessionId: payload.session.id,
          providerId: payload.session.agentType,
          question: question.question,
          header: question.header,
          options: question.options,
          multiSelect: question.multiSelect,
        });
        if (answer) {
          answers[question.question] = answer;
        }
      }

      return {
        behavior: "allow",
        toolUseID: options.toolUseID,
        updatedInput: { ...input, answers },
      };
    }

    const persistentSuggestions = getPersistentSuggestions(options.suggestions);
    const permissionRequest: AgentPermissionRequestPayload = {
      id: options.toolUseID,
      sessionId: payload.session.id,
      providerId: payload.session.agentType,
      kind: toolName,
      title: getTitle(toolName, input, options.title, options.displayName),
      description: options.description ?? options.decisionReason ?? null,
      rawInput: {
        input,
        blockedPath: options.blockedPath,
        suggestions: options.suggestions,
        toolName,
      },
      locations: getLocations(input, options.blockedPath),
      options: createPermissionOptions([
        "reject_once",
        "allow_once",
        ...(persistentSuggestions.length > 0
          ? (["allow_always"] as const)
          : []),
      ]),
    };
    const decision =
      (await payload.requestPermission?.(permissionRequest)) ?? "reject_once";

    if (decision === "allow_always") {
      return {
        behavior: "allow",
        toolUseID: options.toolUseID,
        updatedInput: input,
        ...(persistentSuggestions.length > 0
          ? { updatedPermissions: persistentSuggestions }
          : {}),
      };
    }

    if (decision === "allow_once") {
      return {
        behavior: "allow",
        toolUseID: options.toolUseID,
        updatedInput: input,
        decisionClassification: "user_temporary",
      };
    }

    return {
      behavior: "deny",
      message: "Denied by user",
      toolUseID: options.toolUseID,
      decisionClassification: "user_reject",
    };
  };
}

function mapPlanApprovalDecision(
  decision: AgentPlanApprovalDecision | undefined,
  input: Record<string, unknown>,
  toolUseID: string,
): PermissionResult {
  if (decision?.outcome === "approved") {
    return {
      behavior: "allow",
      toolUseID,
      updatedInput: input,
    };
  }

  return {
    behavior: "deny",
    message:
      decision?.feedback?.trim() ||
      (decision?.outcome === "abandoned"
        ? "The user abandoned the plan. Do not continue implementing it."
        : "The user requested changes to the plan before implementation."),
    toolUseID,
  };
}
