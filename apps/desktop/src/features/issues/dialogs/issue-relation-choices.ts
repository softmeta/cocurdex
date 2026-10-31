import type {
  IssueRelation,
  IssueRelationDirection,
  IssueRelationKind,
} from "@cocurdex/shared";

export type IssueRelationChoice =
  | "blocks"
  | "blockedBy"
  | "related"
  | "duplicateOf"
  | "duplicatedBy";

interface RelationChoiceSpec {
  kind: IssueRelationKind;
  direction: IssueRelationDirection;
}

const RELATION_CHOICE_SPECS: Record<IssueRelationChoice, RelationChoiceSpec> = {
  blocks: { kind: "blocks", direction: "outgoing" },
  blockedBy: { kind: "blocks", direction: "incoming" },
  related: { kind: "related", direction: "outgoing" },
  duplicateOf: { kind: "duplicate", direction: "outgoing" },
  duplicatedBy: { kind: "duplicate", direction: "incoming" },
};

export const ADDABLE_RELATION_CHOICES: readonly IssueRelationChoice[] = [
  "blocks",
  "blockedBy",
  "related",
  "duplicateOf",
];

export function relationChoiceSpec(
  choice: IssueRelationChoice,
): RelationChoiceSpec {
  return RELATION_CHOICE_SPECS[choice];
}

export function relationChoiceOf(
  relation: Pick<IssueRelation, "kind" | "direction">,
): IssueRelationChoice {
  if (relation.kind === "related") {
    return "related";
  }
  if (relation.kind === "blocks") {
    return relation.direction === "outgoing" ? "blocks" : "blockedBy";
  }
  return relation.direction === "outgoing" ? "duplicateOf" : "duplicatedBy";
}

export function encodeRelationOption(
  choice: IssueRelationChoice,
  issueId: string,
): string {
  return `${choice}:${issueId}`;
}

export function decodeRelationOption(
  value: string,
): { choice: IssueRelationChoice; issueId: string } | null {
  const separator = value.indexOf(":");
  const choice = value.slice(0, separator) as IssueRelationChoice;
  const issueId = value.slice(separator + 1);
  if (
    separator < 0 ||
    !issueId ||
    !Object.hasOwn(RELATION_CHOICE_SPECS, choice)
  ) {
    return null;
  }
  return { choice, issueId };
}
