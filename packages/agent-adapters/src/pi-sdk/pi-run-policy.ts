import type { AgentRunPolicy } from "@cocurdex/agent-core";
import type { InlineExtension } from "@earendil-works/pi-coding-agent";

export interface PiRunPolicy {
  extension: InlineExtension;
  set(policy: AgentRunPolicy | null): void;
}

const REMINDER_TYPE = "cocurdex-run-reminder";

export function createPiRunPolicy(): PiRunPolicy {
  let policy: AgentRunPolicy | null = null;
  let reported = false;
  let reminded = false;
  let unrestrictedTools: string[] | null = null;

  const allows = (toolName: string) =>
    !policy?.allowedTools || policy.allowedTools.includes(toolName);

  return {
    extension: {
      name: "cocurdex-run-policy",
      builtin: true,
      factory: (pi) => {
        pi.on("before_agent_start", (event) => {
          const allowed = policy?.allowedTools;
          if (allowed) {
            unrestrictedTools ??= pi.getActiveTools();
            event.systemPromptOptions.selectedTools = unrestrictedTools.filter(
              (name) => allowed.includes(name),
            );
            return;
          }
          if (unrestrictedTools) {
            pi.setActiveTools(unrestrictedTools);
            unrestrictedTools = null;
          }
        });
        pi.on("tool_call", (event) => {
          if (allows(event.toolName)) return;
          return { block: true, reason: policy?.blockedToolReason };
        });
        pi.on("tool_execution_end", (event) => {
          if (!event.isError && event.toolName === policy?.requiredTool?.name) {
            reported = true;
          }
        });
        pi.on("agent_before_settle", (event) => {
          const required = policy?.requiredTool;
          if (!required || reported || reminded) return;
          if (event.outcome !== "completed") return;
          reminded = true;
          return {
            entries: [
              {
                type: "custom_message",
                customType: REMINDER_TYPE,
                content: required.reminder,
                display: false,
              },
            ],
            continue: true,
          };
        });
      },
    },
    set(next) {
      policy = next;
      reported = false;
      reminded = false;
    },
  };
}
