import {
  isWorkflowStepId,
  isWorkflowTerminalStatus,
  outcomesForWorkflowStep,
  permissionProfileForWorkflowStep,
} from "./definition-graph";
import { WorkflowTransitionError } from "./errors";
import type {
  WorkflowArtifactSchemaId,
  WorkflowDefinitionIssue,
  WorkflowDefinitionRevision,
  WorkflowStepDefinition,
} from "./types";

const ALL_SCHEMAS: WorkflowArtifactSchemaId[] = [
  "plan_artifact.v1",
  "change_set.v1",
  "validation_report.v1",
  "review_decision.v1",
];

function issue(
  code: string,
  message: string,
  stepId?: string,
): WorkflowDefinitionIssue {
  return stepId ? { code, message, stepId } : { code, message };
}

function equalSets(
  left: Set<WorkflowArtifactSchemaId>,
  right: Set<WorkflowArtifactSchemaId>,
): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const value of left) {
    if (!right.has(value)) {
      return false;
    }
  }
  return true;
}

function intersectSets(
  sets: Array<Set<WorkflowArtifactSchemaId>>,
): Set<WorkflowArtifactSchemaId> {
  if (sets.length === 0) {
    return new Set();
  }
  const [first, ...rest] = sets;
  const result = new Set(first);
  for (const candidate of rest) {
    for (const value of result) {
      if (!candidate.has(value)) {
        result.delete(value);
      }
    }
  }
  return result;
}

export function workflowDefinitionIssues(
  definition: WorkflowDefinitionRevision,
): WorkflowDefinitionIssue[] {
  const issues: WorkflowDefinitionIssue[] = [];
  if (definition.steps.length === 0) {
    issues.push(
      issue("empty_steps", "Workflow must contain at least one step."),
    );
    return issues;
  }

  const stepsById = new Map<string, WorkflowStepDefinition>();
  for (const step of definition.steps) {
    if (!isWorkflowStepId(step.id)) {
      issues.push(
        issue("invalid_step_id", `Step id '${step.id}' is invalid.`, step.id),
      );
    }
    if (stepsById.has(step.id)) {
      issues.push(
        issue("duplicate_step_id", `Duplicate step id '${step.id}'.`, step.id),
      );
      continue;
    }
    stepsById.set(step.id, step);
    if (step.maxAttempts < 1) {
      issues.push(
        issue(
          "invalid_max_attempts",
          `Step '${step.id}' must allow at least one attempt.`,
          step.id,
        ),
      );
    }
    if (step.kind === "agent") {
      if (!step.role) {
        issues.push(
          issue(
            "agent_missing_role",
            `Agent step '${step.id}' needs a role.`,
            step.id,
          ),
        );
      }
      if (!step.outputSchema) {
        issues.push(
          issue(
            "agent_missing_output",
            `Agent step '${step.id}' needs an output artifact.`,
            step.id,
          ),
        );
      }
      if (!step.instruction?.trim()) {
        issues.push(
          issue(
            "agent_missing_instruction",
            `Agent step '${step.id}' needs an instruction.`,
            step.id,
          ),
        );
      }
      if (
        step.outputSchema === "validation_report.v1" &&
        step.role !== "implementer"
      ) {
        issues.push(
          issue(
            "validation_role",
            `Validation step '${step.id}' must use the implementer role.`,
            step.id,
          ),
        );
      }
    }
    if (step.kind === "gate" && step.outputSchema) {
      issues.push(
        issue(
          "gate_has_output",
          `Gate '${step.id}' cannot produce an artifact.`,
          step.id,
        ),
      );
    }
    const expectedPermission = permissionProfileForWorkflowStep(step);
    if (step.permissionProfile !== expectedPermission) {
      issues.push(
        issue(
          "permission_mismatch",
          `Step '${step.id}' requires permission '${expectedPermission}'.`,
          step.id,
        ),
      );
    }
  }

  if (!definition.initialStepId) {
    issues.push(
      issue("missing_initial", "Workflow must declare an initial step."),
    );
  } else if (!stepsById.has(definition.initialStepId)) {
    issues.push(
      issue(
        "unknown_initial",
        `Initial step '${definition.initialStepId}' does not exist.`,
      ),
    );
  }

  const transitionKeys = new Set<string>();
  const adjacency = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();

  for (const step of definition.steps) {
    adjacency.set(step.id, []);
    predecessors.set(step.id, []);
  }

  for (const transition of definition.transitions) {
    const key = `${transition.from}:${transition.outcome}`;
    if (transitionKeys.has(key)) {
      issues.push(
        issue(
          "duplicate_transition",
          `Step '${transition.from}' has more than one '${transition.outcome}' transition.`,
          transition.from,
        ),
      );
    }
    transitionKeys.add(key);

    if (!stepsById.has(transition.from)) {
      issues.push(
        issue(
          "unknown_transition_from",
          `Transition starts from unknown step '${transition.from}'.`,
        ),
      );
      continue;
    }

    if (transition.to && transition.terminalStatus) {
      issues.push(
        issue(
          "ambiguous_target",
          `Transition from '${transition.from}' cannot have both a next step and a terminal status.`,
          transition.from,
        ),
      );
    }
    if (!transition.to && !transition.terminalStatus) {
      issues.push(
        issue(
          "missing_target",
          `Transition from '${transition.from}' needs a next step or terminal status.`,
          transition.from,
        ),
      );
    }
    if (transition.to && !stepsById.has(transition.to)) {
      issues.push(
        issue(
          "unknown_transition_to",
          `Transition from '${transition.from}' points to unknown step '${transition.to}'.`,
          transition.from,
        ),
      );
    }
    if (
      transition.terminalStatus &&
      !isWorkflowTerminalStatus(transition.terminalStatus)
    ) {
      issues.push(
        issue(
          "invalid_terminal",
          `Transition from '${transition.from}' uses invalid terminal status '${transition.terminalStatus}'.`,
          transition.from,
        ),
      );
    }
    if (
      transition.maxTraversals !== undefined &&
      transition.maxTraversals < 1
    ) {
      issues.push(
        issue(
          "invalid_max_traversals",
          `Transition from '${transition.from}' must allow at least one traversal.`,
          transition.from,
        ),
      );
    }
    if (transition.to) {
      adjacency.get(transition.from)?.push(transition.to);
      predecessors.get(transition.to)?.push(transition.from);
    }
  }

  for (const step of definition.steps) {
    const required = outcomesForWorkflowStep(step);
    for (const outcome of required) {
      if (!transitionKeys.has(`${step.id}:${outcome}`)) {
        issues.push(
          issue(
            "missing_outcome",
            `Step '${step.id}' is missing a '${outcome}' transition.`,
            step.id,
          ),
        );
      }
    }
  }

  const visiting = new Set<string>();
  const visitedDfs = new Set<string>();
  function visit(stepId: string) {
    visiting.add(stepId);
    for (const transition of definition.transitions) {
      if (transition.from !== stepId || !transition.to) {
        continue;
      }
      if (visiting.has(transition.to)) {
        if (transition.maxTraversals === undefined) {
          issues.push(
            issue(
              "cycle_unbounded",
              `Cycle through '${transition.from}' → '${transition.to}' needs a traversal limit.`,
              transition.from,
            ),
          );
        }
        continue;
      }
      if (!visitedDfs.has(transition.to)) {
        visit(transition.to);
      }
    }
    visiting.delete(stepId);
    visitedDfs.add(stepId);
  }
  if (definition.initialStepId && stepsById.has(definition.initialStepId)) {
    visit(definition.initialStepId);
  }

  const reachable = new Set<string>();
  const queue = definition.initialStepId ? [definition.initialStepId] : [];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || reachable.has(current) || !stepsById.has(current)) {
      continue;
    }
    reachable.add(current);
    for (const next of adjacency.get(current) ?? []) {
      queue.push(next);
    }
  }
  for (const step of definition.steps) {
    if (!reachable.has(step.id)) {
      issues.push(
        issue(
          "unreachable_step",
          `Step '${step.id}' is not reachable.`,
          step.id,
        ),
      );
    }
  }

  const before = new Map<string, Set<WorkflowArtifactSchemaId>>();
  const after = new Map<string, Set<WorkflowArtifactSchemaId>>();
  const all = new Set(ALL_SCHEMAS);
  for (const step of definition.steps) {
    before.set(
      step.id,
      step.id === definition.initialStepId ? new Set() : new Set(all),
    );
    const produced = step.outputSchema
      ? new Set([step.outputSchema])
      : new Set<WorkflowArtifactSchemaId>();
    after.set(
      step.id,
      new Set([...(before.get(step.id) ?? new Set()), ...produced]),
    );
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (const step of definition.steps) {
      const nextBefore =
        step.id === definition.initialStepId
          ? new Set<WorkflowArtifactSchemaId>()
          : intersectSets(
              (predecessors.get(step.id) ?? []).map(
                (predecessor) =>
                  after.get(predecessor) ?? new Set<WorkflowArtifactSchemaId>(),
              ),
            );
      const produced = step.outputSchema
        ? new Set([step.outputSchema])
        : new Set<WorkflowArtifactSchemaId>();
      const nextAfter = new Set([...nextBefore, ...produced]);
      if (
        !equalSets(before.get(step.id) ?? new Set(), nextBefore) ||
        !equalSets(after.get(step.id) ?? new Set(), nextAfter)
      ) {
        changed = true;
        before.set(step.id, nextBefore);
        after.set(step.id, nextAfter);
      }
    }
  }

  for (const step of definition.steps) {
    const available = before.get(step.id) ?? new Set();
    for (const schemaId of step.inputSchemas) {
      if (!available.has(schemaId)) {
        issues.push(
          issue(
            "missing_input",
            `Step '${step.id}' requires '${schemaId}' on every incoming path.`,
            step.id,
          ),
        );
      }
    }
  }

  return issues;
}

export function assertValidWorkflowDefinition(
  definition: WorkflowDefinitionRevision,
): void {
  const issues = workflowDefinitionIssues(definition);
  if (issues.length > 0) {
    throw new WorkflowTransitionError(
      issues.map((entry) => entry.message).join(" "),
    );
  }
}
