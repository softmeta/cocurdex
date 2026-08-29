import type { MessageRecord } from "@cocurdex/shared";
import type { EditorTheme } from "@earendil-works/pi-tui";
import type { SessionTuiState } from "./session-tui-model";

function color(code: string, text: string) {
  return process.env.NO_COLOR ? text : `\x1b[${code}m${text}\x1b[0m`;
}

export const sessionTuiStyles = {
  bold: (text: string) => color("1", text),
  cyan: (text: string) => color("36", text),
  dim: (text: string) => color("2", text),
  green: (text: string) => color("32", text),
  red: (text: string) => color("31", text),
  yellow: (text: string) => color("33", text),
};

export const sessionEditorTheme: EditorTheme = {
  borderColor: sessionTuiStyles.dim,
  selectList: {
    selectedPrefix: sessionTuiStyles.cyan,
    selectedText: sessionTuiStyles.bold,
    description: sessionTuiStyles.dim,
    scrollInfo: sessionTuiStyles.dim,
    noMatch: sessionTuiStyles.yellow,
  },
};

export function renderSessionHeader(state: SessionTuiState) {
  const provider = state.session.providerSnapshot;
  const model = provider?.modelName ?? provider?.modelId ?? "default model";
  return [
    sessionTuiStyles.bold(state.session.title),
    sessionTuiStyles.dim(
      `${state.session.agentType} · ${model} · ${state.session.status}`,
    ),
  ].join("\n");
}

export function renderSessionTranscript(state: SessionTuiState) {
  const entries = [
    ...state.messages.map((message) => ({
      at: message.createdAt,
      text: renderMessage(message),
    })),
    ...state.toolCalls.map((toolCall) => ({
      at: toolCall.startedAt,
      text: `${sessionTuiStyles.yellow("tool")} ${toolCall.title} ${sessionTuiStyles.dim(`[${toolCall.status}]`)}`,
    })),
  ].sort((left, right) => left.at.localeCompare(right.at));
  const interactionLines = renderInteractions(state);
  const planLines = state.plan
    ? [
        sessionTuiStyles.bold("plan"),
        ...state.plan.steps.map(
          (step) => `  ${statusGlyph(step.status)} ${step.step}`,
        ),
      ]
    : [];
  const queued = state.queuedAgentInputs.length
    ? [
        sessionTuiStyles.dim(
          `${state.queuedAgentInputs.length} queued message(s)`,
        ),
      ]
    : [];
  return [
    ...entries.map((entry) => entry.text),
    ...planLines,
    ...interactionLines,
    ...queued,
  ].join("\n\n");
}

export function renderSessionFooter(state: SessionTuiState) {
  const context = state.usage?.contextTokensUsed;
  const window = state.usage?.contextWindowSize;
  const usage =
    context != null && window != null
      ? ` · context ${context.toLocaleString()}/${window.toLocaleString()}`
      : "";
  const stopHint =
    state.session.status === "running" ? "Ctrl+C stop" : "Ctrl+C exit";
  return sessionTuiStyles.dim(`${stopHint} · /quit exit · Enter send${usage}`);
}

function renderMessage(message: MessageRecord) {
  if (message.role === "user") {
    return `${sessionTuiStyles.cyan("you")}\n${message.content}`;
  }
  if (message.role === "system") {
    return `${sessionTuiStyles.yellow("system")}\n${message.content}`;
  }
  if (message.kind === "reasoning") {
    return `${sessionTuiStyles.dim("reasoning")}\n${sessionTuiStyles.dim(message.content)}`;
  }
  return `${sessionTuiStyles.green("assistant")}\n${message.content}`;
}

function renderInteractions(state: SessionTuiState) {
  const lines: string[] = [];
  const permission = state.interactions.permissions[0];
  if (permission) {
    const commands = permission.options.map((option) => {
      const command = {
        allow_once: "/allow",
        allow_always: "/always",
        reject_once: "/deny",
        reject_always: "/deny-always",
      }[option.kind];
      return `${command} (${option.label})`;
    });
    lines.push(
      `${sessionTuiStyles.yellow("permission")} ${permission.title}\n${commands.join(" · ")}`,
    );
  }
  const question = state.interactions.questions[0];
  if (question) {
    lines.push(
      `${sessionTuiStyles.yellow("question")} ${question.question}\n/answer <text>`,
    );
  }
  const approval = state.interactions.planApprovals[0];
  if (approval) {
    lines.push(
      `${sessionTuiStyles.yellow("plan review")}\n${approval.planContent ?? "Plan file is ready for review."}\n/approve · /revise <feedback> · /abandon`,
    );
  }
  return lines;
}

function statusGlyph(status: "pending" | "in_progress" | "completed") {
  if (status === "completed") return sessionTuiStyles.green("✓");
  if (status === "in_progress") return sessionTuiStyles.yellow("●");
  return sessionTuiStyles.dim("○");
}
