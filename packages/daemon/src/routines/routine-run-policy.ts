import type { AgentRunPolicy } from "@cocurdex/agent-core";
import type { RoutineAccess, RoutineRecord } from "@cocurdex/shared";

export const ROUTINE_REPORT_TOOL = "routine_report";
export const ROUTINE_RUN_SECTION = "routine_run";

const READ_AND_DRAFT_TOOLS = [
  "read",
  "grep",
  "find",
  "ls",
  "history_read",
  "applications_list",
  "applications_tools",
  "applications_read",
  "memory_recall",
  "memory_show",
  "memory_remember",
  "memory_policy",
  "routine_list",
  "routine_runs",
  ROUTINE_REPORT_TOOL,
];

const REPORT_GUIDE = [
  `When you are done, call ${ROUTINE_REPORT_TOOL} exactly once with one status:`,
  "- ready: you have a result the user should read.",
  "- dropped: nothing worth telling the user this time; it is recorded but not delivered.",
  "- needs_you: the user has to decide or answer; put the question in question.",
  "- blocked: something outside your control stopped you.",
  "- failed: you could not do the task.",
  "The summary is what the user reads, so write it for them.",
].join("\n");

const ACCESS_GUIDE: Record<RoutineAccess, string> = {
  "read-and-draft":
    "You may read files, your memory, and provider-declared read-only tools in allowed applications. You cannot change files, run commands, or use mutating application tools. When the task needs one of those, describe what you would do and report needs_you.",
  full: "You may use every tool. Act only within what the routine asks for.",
};

export function routineRunSection(routine: RoutineRecord) {
  return [
    `This is an unattended run of your routine "${routine.name}". The user is not watching and cannot answer questions during the run; put anything you need from them in your report.`,
    ACCESS_GUIDE[routine.access],
    REPORT_GUIDE,
  ].join("\n\n");
}

export function routineRunPolicy(access: RoutineAccess): AgentRunPolicy {
  return {
    allowedTools: access === "full" ? null : READ_AND_DRAFT_TOOLS,
    blockedToolReason:
      "This routine runs with read-and-draft access, so this tool is not available. Describe the change in your routine_report instead.",
    requiredTool: {
      name: ROUTINE_REPORT_TOOL,
      reminder: `You have not called ${ROUTINE_REPORT_TOOL} yet. Call it now to finish this run.`,
    },
  };
}
