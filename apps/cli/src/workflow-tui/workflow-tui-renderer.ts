import type {
  WorkflowTuiArtifactView,
  WorkflowTuiStepView,
  WorkflowTuiView,
} from "./workflow-tui-model";

export type WorkflowTuiConfirmation = "reject" | "cancel" | null;

export interface WorkflowTuiRenderOptions {
  width: number;
  height: number;
  selectedStepIndex: number;
  notice: string | null;
  confirmation: WorkflowTuiConfirmation;
  busy: boolean;
  color: boolean;
}

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
};

export function renderWorkflowTui(
  view: WorkflowTuiView,
  options: WorkflowTuiRenderOptions,
): string[] {
  const width = Math.max(1, options.width);
  const height = Math.max(1, options.height);
  const selectedStep = view.steps[options.selectedStepIndex] ?? view.steps[0];
  const lines: string[] = [];

  lines.push(style(" COCURDEX WORKFLOW", ANSI.bold + ANSI.cyan, options.color));
  lines.push(
    fitLine(
      ` run ${view.runId}  ${view.definition}  status ${view.status.toUpperCase()}  rev ${view.revision}`,
      width,
    ),
  );
  lines.push(fitLine(` workspace ${view.workspaceRootPath}`, width));
  lines.push(...prefixWrapped(" objective ", view.prompt, width, 2));
  lines.push(style("─".repeat(width), ANSI.dim, options.color));
  lines.push(style(" STEPS", ANSI.bold, options.color));

  for (let index = 0; index < view.steps.length; index += 1) {
    const step = view.steps[index];
    const marker = index === options.selectedStepIndex ? ">" : " ";
    const current = step.isCurrent ? " current" : "";
    const executor = step.agentId
      ? `  ${step.agentId}${step.model ? `/${step.model}` : ""}`
      : "";
    const line = fitLine(
      `${marker} ${statusGlyph(step.status)} ${step.stepId}  ${step.kind}/${step.role ?? "system"}  ${step.status}${current}${executor}`,
      width,
    );
    lines.push(styleStep(line, step, options.color));
  }

  if (selectedStep) {
    lines.push(style("─".repeat(width), ANSI.dim, options.color));
    lines.push(
      style(
        fitLine(` DETAIL ${selectedStep.stepId}`, width),
        ANSI.bold,
        options.color,
      ),
    );
    lines.push(
      fitLine(
        ` attempt ${selectedStep.attemptStatus ?? "none"}  count ${selectedStep.attemptCount}  session ${selectedStep.sessionId ?? "none"}`,
        width,
      ),
    );
    if (selectedStep.providerSessionId) {
      lines.push(
        fitLine(` provider session ${selectedStep.providerSessionId}`, width),
      );
    }
    if (selectedStep.activeSuspensionReason) {
      lines.push(
        style(
          fitLine(
            ` suspended ${selectedStep.activeSuspensionReason}: ${selectedStep.activeSuspensionMessage ?? ""}`,
            width,
          ),
          ANSI.yellow,
          options.color,
        ),
      );
    }
    if (selectedStep.attemptError) {
      lines.push(
        style(
          fitLine(` error ${selectedStep.attemptError}`, width),
          ANSI.red,
          options.color,
        ),
      );
    }
    lines.push(...renderArtifact(selectedStep.artifacts.at(-1), width));
  }

  const footer = renderFooter(view, options, width);
  const availableBodyRows = Math.max(1, height - footer.length);
  const body = lines.slice(0, availableBodyRows);
  while (body.length < availableBodyRows) {
    body.push("");
  }
  return [...body, ...footer].slice(0, height);
}

function renderFooter(
  view: WorkflowTuiView,
  options: WorkflowTuiRenderOptions,
  width: number,
) {
  let message = options.notice ?? "";
  if (options.confirmation) {
    message = `Confirm ${options.confirmation}? y yes / n no`;
  } else if (options.busy) {
    message = "Working...";
  }

  const actions = ["j/k select", "f current", "r refresh"];
  if (view.actions.canStart) actions.push("s start");
  if (view.actions.canApprove) actions.push("a approve", "x reject");
  if (view.actions.canCancel) actions.push("c cancel");
  actions.push("q quit");

  return [
    style(fitLine(` ${message}`, width), ANSI.yellow, options.color),
    style(fitLine(` ${actions.join("  ")}`, width), ANSI.dim, options.color),
  ];
}

function renderArtifact(
  artifact: WorkflowTuiArtifactView | undefined,
  width: number,
) {
  if (!artifact) {
    return [" artifact none"];
  }

  const header = fitLine(
    ` artifact ${artifact.schemaId}  ${artifact.contentHash}`,
    width,
  );
  const content = JSON.stringify(artifact.content);
  return [header, ...prefixWrapped("   ", content, width, 2)];
}

function styleStep(line: string, step: WorkflowTuiStepView, color: boolean) {
  if (step.status === "completed") return style(line, ANSI.green, color);
  if (step.status === "failed") return style(line, ANSI.red, color);
  if (step.status === "awaiting_gate") return style(line, ANSI.yellow, color);
  if (step.isCurrent) return style(line, ANSI.cyan, color);
  return line;
}

function statusGlyph(status: WorkflowTuiStepView["status"]) {
  if (status === "completed") return "[x]";
  if (status === "running" || status === "ready") return "[>]";
  if (status === "awaiting_gate") return "[?]";
  if (status === "failed") return "[!]";
  if (status === "cancelled") return "[-]";
  return "[ ]";
}

function prefixWrapped(
  prefix: string,
  value: string,
  width: number,
  maxLines: number,
) {
  const available = Math.max(1, width - cellWidth(prefix));
  const chunks: string[] = [];
  let remaining = value.replaceAll(/\s+/g, " ").trim();
  while (remaining && chunks.length < maxLines) {
    const chunk = sliceCells(remaining, available);
    chunks.push(
      `${chunks.length === 0 ? prefix : " ".repeat(prefix.length)}${chunk}`,
    );
    remaining = remaining.slice(chunk.length).trimStart();
  }
  if (chunks.length === 0) chunks.push(prefix.trimEnd());
  if (remaining && chunks.length > 0) {
    chunks[chunks.length - 1] = fitLine(`${chunks.at(-1)}…`, width);
  }
  return chunks.map((line) => fitLine(line, width));
}

function fitLine(value: string, width: number) {
  if (cellWidth(value) <= width) return value;
  if (width === 1) return sliceCells(value, 1);
  return `${sliceCells(value, width - 1)}…`;
}

function sliceCells(value: string, width: number) {
  let result = "";
  let used = 0;
  for (const character of value) {
    const nextWidth = characterWidth(character);
    if (used + nextWidth > width) break;
    result += character;
    used += nextWidth;
  }
  return result;
}

function cellWidth(value: string) {
  let width = 0;
  for (const character of value) width += characterWidth(character);
  return width;
}

function characterWidth(character: string) {
  const codePoint = character.codePointAt(0) ?? 0;
  if (/\p{Mark}/u.test(character) || codePoint < 32) return 0;
  return isWide(codePoint) ? 2 : 1;
}

function isWide(codePoint: number) {
  return (
    codePoint >= 0x1100 &&
    (codePoint <= 0x115f ||
      codePoint === 0x2329 ||
      codePoint === 0x232a ||
      (codePoint >= 0x2e80 && codePoint <= 0xa4cf) ||
      (codePoint >= 0xac00 && codePoint <= 0xd7a3) ||
      (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
      (codePoint >= 0xfe10 && codePoint <= 0xfe6f) ||
      (codePoint >= 0xff00 && codePoint <= 0xff60) ||
      (codePoint >= 0x1f300 && codePoint <= 0x1faff))
  );
}

function style(value: string, code: string, enabled: boolean) {
  return enabled && value ? `${code}${value}${ANSI.reset}` : value;
}
