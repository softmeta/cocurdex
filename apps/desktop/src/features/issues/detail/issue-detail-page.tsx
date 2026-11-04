import type { IssueRecord } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { ArrowLeft } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PanelToolbar } from "@/app/layout/panel-toolbar";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import {
  MarkdownBodyEditor,
  type MarkdownBodyEditorHandle,
} from "@/components/markdown-body-editor";
import { Text } from "@/components/ui";
import {
  type IssueDetailState,
  saveIssueDetailAtom,
} from "../issue-detail-store";
import { IssueActivity } from "./issue-activity";
import { IssueDetailSections } from "./issue-detail-sections";
import type { IssueDetailActions } from "./issue-dialog-types";
import { type IssueFieldOptions, IssueFieldRow } from "./issue-field-row";
import { useIssueTextAutosave } from "./use-issue-text-autosave";

export function IssueDetailPage({
  state,
  viewTitle,
  options,
  actions,
  leading,
  onBack,
}: {
  state: IssueDetailState;
  viewTitle: string;
  options: IssueFieldOptions;
  actions: IssueDetailActions;
  leading?: ReactNode;
  onBack: () => void;
}) {
  const { t } = useTranslation("issues");
  const saveDetail = useSetAtom(saveIssueDetailAtom);
  const { card, detail, bodyEpoch, bodyStatus } = state;

  return (
    <article
      data-issue-id={card.id}
      aria-label={`${card.identifier} ${card.title}`}
      className="flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <PanelToolbar className="gap-1" divided={false}>
        {leading}
        <TitlebarIconButton
          aria-label={t("detail.backToView", { view: viewTitle })}
          onClick={onBack}
        >
          <ArrowLeft className="size-3.5 rtl:rotate-180" />
        </TitlebarIconButton>
        <div className="flex min-w-0 items-center gap-1.5 ps-0.5">
          <Text size="body" truncate className="text-editor-fg-subtle">
            {viewTitle}
          </Text>
          <span className="text-editor-fg-subtle" aria-hidden>
            ›
          </span>
          <Text
            size="body"
            weight="medium"
            className="shrink-0 tabular-nums text-editor-fg"
          >
            {card.identifier}
          </Text>
        </div>
      </PanelToolbar>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col pb-10">
          <IssueTextFields
            key={`${card.id}-${bodyEpoch}`}
            card={card}
            bodyStatus={bodyStatus}
            onSave={(changes) => {
              void saveDetail({ id: card.id, changes });
            }}
          />
          <IssueFieldRow
            issueId={card.id}
            knownParent={detail?.parent ?? null}
            values={card}
            options={options}
            onChange={(changes) => {
              void saveDetail({ id: card.id, changes });
            }}
            onCreateLabel={actions.onCreateLabel}
          />
          {detail ? (
            <>
              <IssueDetailSections
                detail={detail}
                issues={options.issues}
                onOpenIssue={actions.onOpenIssue}
                onAddSubIssue={() => actions.onAddSubIssue(card)}
                onAddRelation={actions.onAddRelation}
                onRemoveRelation={actions.onRemoveRelation}
              />
              <IssueActivity
                events={detail.events}
                statusOptions={options.statusOptions}
                priorityOptions={options.priorityOptions}
                onComment={actions.onComment}
              />
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function IssueTextFields({
  card,
  bodyStatus,
  onSave,
}: {
  card: IssueRecord;
  bodyStatus: IssueDetailState["bodyStatus"];
  onSave: (changes: { title?: string; description?: string | null }) => void;
}) {
  const { t } = useTranslation("issues");
  const [title, setTitle] = useState(card.title);
  const descriptionRef = useRef<MarkdownBodyEditorHandle>(null);
  const autosave = useIssueTextAutosave({
    initialTitle: card.title,
    initialDescription: card.description ?? null,
    save: onSave,
  });

  return (
    <div className="flex flex-col gap-1 px-5 pt-5 pb-2">
      <input
        value={title}
        aria-label={t("dialog.titlePlaceholder")}
        placeholder={t("dialog.titlePlaceholder")}
        onChange={(e) => {
          setTitle(e.target.value);
          autosave.setDraftTitle(e.target.value);
        }}
        onBlur={() => setTitle(autosave.commitTitle())}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.nativeEvent.isComposing) {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        className="w-full border-0 bg-transparent text-display font-medium text-editor-fg outline-none placeholder:text-editor-fg-subtle"
      />
      {bodyStatus === "ready" ? (
        <MarkdownBodyEditor
          ref={descriptionRef}
          initialMarkdown={card.description ?? ""}
          placeholder={t("dialog.descriptionPlaceholder")}
          className="min-h-28"
          onChange={() => autosave.scheduleDescription(descriptionRef.current)}
        />
      ) : (
        <div className="min-h-28">
          {bodyStatus === "error" ? (
            <Text size="meta" tone="destructive">
              {t("detail.loadFailed")}
            </Text>
          ) : null}
        </div>
      )}
    </div>
  );
}
