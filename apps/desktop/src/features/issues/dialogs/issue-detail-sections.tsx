import type {
  IssueDetail,
  IssueRecord,
  IssueRelation,
  IssueSummary,
} from "@cocurdex/shared";
import { isClosedStatusCategory } from "@cocurdex/shared";
import { Bot, CircleCheck, CircleDot, Link2, Plus, X } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AppSearchableSelect } from "@/components/app";
import { Button, Text } from "@/components/ui";
import { openSessionById } from "@/lib";
import type { IssueRelationChange } from "../issue-detail-store";
import {
  ADDABLE_RELATION_CHOICES,
  decodeRelationOption,
  encodeRelationOption,
  type IssueRelationChoice,
  relationChoiceOf,
  relationChoiceSpec,
} from "./issue-relation-choices";

function useRelationChoiceLabels(): Record<IssueRelationChoice, string> {
  const { t } = useTranslation("issues");
  return {
    blocks: t("detail.relation.blocks"),
    blockedBy: t("detail.relation.blockedBy"),
    related: t("detail.relation.related"),
    duplicateOf: t("detail.relation.duplicateOf"),
    duplicatedBy: t("detail.relation.duplicatedBy"),
  };
}

interface IssueDetailSectionsProps {
  detail: IssueDetail;
  issues: readonly IssueRecord[];
  onOpenIssue: (issueId: string) => void;
  onAddSubIssue: () => void;
  onAddRelation: (change: IssueRelationChange) => void;
  onRemoveRelation: (change: IssueRelationChange) => void;
}

export function IssueDetailSections({
  detail,
  issues,
  onOpenIssue,
  onAddSubIssue,
  onAddRelation,
  onRemoveRelation,
}: IssueDetailSectionsProps) {
  const { t } = useTranslation("issues");
  return (
    <>
      <DetailSection
        title={t("detail.subIssues")}
        action={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("detail.addSubIssue")}
            onClick={onAddSubIssue}
          >
            <Plus className="size-3.5" />
          </Button>
        }
      >
        {detail.children.map((child) => (
          <IssueSummaryRow
            key={child.id}
            issue={child}
            onOpen={() => onOpenIssue(child.id)}
          />
        ))}
      </DetailSection>
      <DetailSection
        title={t("detail.relations")}
        action={
          <AddRelationSelect
            currentId={detail.issue.id}
            issues={issues}
            onAdd={onAddRelation}
          />
        }
      >
        {detail.relations.map((relation) => (
          <RelationRow
            key={`${relation.kind}-${relation.direction}-${relation.issue.id}`}
            relation={relation}
            onOpen={() => onOpenIssue(relation.issue.id)}
            onRemove={() =>
              onRemoveRelation({
                kind: relation.kind,
                direction: relation.direction,
                relatedId: relation.issue.id,
              })
            }
          />
        ))}
      </DetailSection>
      {detail.sessions.length > 0 ? (
        <DetailSection title={t("detail.sessions")}>
          {detail.sessions.map((session) => (
            <button
              key={session.sessionId}
              type="button"
              onClick={() => openSessionById(session.sessionId)}
              className="flex h-7 w-full min-w-0 items-center gap-2 rounded-control px-1.5 text-start hover:bg-editor-tab-hover-bg"
            >
              <Bot className="size-3.5 shrink-0 text-editor-fg-subtle" />
              <Text size="meta" truncate className="flex-1 text-editor-fg">
                {session.title || t("detail.untitledSession")}
              </Text>
              {session.status ? (
                <Text size="meta" className="shrink-0 text-editor-fg-subtle">
                  {session.status}
                </Text>
              ) : null}
            </button>
          ))}
        </DetailSection>
      ) : null}
    </>
  );
}

function DetailSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-0.5 border-t border-editor-border/60 px-5 py-2.5">
      <div className="flex h-7 items-center justify-between gap-2">
        <Text size="meta" weight="medium" className="text-editor-fg-muted">
          {title}
        </Text>
        {action}
      </div>
      {children}
    </section>
  );
}

function IssueStatusIcon({ issue }: { issue: IssueSummary }) {
  if (isClosedStatusCategory(issue.statusCategory)) {
    return <CircleCheck className="size-3.5 shrink-0 text-editor-fg-subtle" />;
  }
  return <CircleDot className="size-3.5 shrink-0 text-editor-fg-subtle" />;
}

function IssueSummaryRow({
  issue,
  prefix,
  onOpen,
  trailing,
}: {
  issue: IssueSummary;
  prefix?: string;
  onOpen: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="group flex h-7 min-w-0 items-center gap-1 rounded-control hover:bg-editor-tab-hover-bg">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-2 px-1.5 text-start"
      >
        <IssueStatusIcon issue={issue} />
        {prefix ? (
          <Text size="meta" className="shrink-0 text-editor-fg-subtle">
            {prefix}
          </Text>
        ) : null}
        <Text
          size="meta"
          className="shrink-0 tabular-nums text-editor-fg-subtle"
        >
          {issue.identifier}
        </Text>
        <Text size="meta" truncate className="text-editor-fg">
          {issue.title}
        </Text>
      </button>
      {trailing}
    </div>
  );
}

function RelationRow({
  relation,
  onOpen,
  onRemove,
}: {
  relation: IssueRelation;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation("issues");
  const choiceLabels = useRelationChoiceLabels();
  return (
    <IssueSummaryRow
      issue={relation.issue}
      prefix={choiceLabels[relationChoiceOf(relation)]}
      onOpen={onOpen}
      trailing={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("detail.removeRelation")}
          onClick={onRemove}
        >
          <X className="size-3.5" />
        </Button>
      }
    />
  );
}

function AddRelationSelect({
  currentId,
  issues,
  onAdd,
}: {
  currentId: string;
  issues: readonly IssueRecord[];
  onAdd: (change: IssueRelationChange) => void;
}) {
  const { t } = useTranslation("issues");
  const choiceLabels = useRelationChoiceLabels();
  const candidates = issues.filter((issue) => issue.id !== currentId);
  const options = ADDABLE_RELATION_CHOICES.flatMap((choice) =>
    candidates.map((issue) => ({
      value: encodeRelationOption(choice, issue.id),
      label: `${issue.identifier} ${issue.title}`,
      keywords: issue.identifier,
      group: choice,
      groupLabel: choiceLabels[choice],
    })),
  );
  return (
    <AppSearchableSelect
      value=""
      onValueChange={(value) => {
        const decoded = decodeRelationOption(value);
        if (decoded) {
          onAdd({
            ...relationChoiceSpec(decoded.choice),
            relatedId: decoded.issueId,
          });
        }
      }}
      options={options}
      align="end"
      searchPlaceholder={t("dialog.searchIssues")}
      emptyText={t("dialog.noMatchingIssues")}
      triggerAriaLabel={t("detail.addRelation")}
      showChevron={false}
      trigger={
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t("detail.addRelation")}
        >
          <Link2 className="size-3.5" />
        </Button>
      }
    />
  );
}
