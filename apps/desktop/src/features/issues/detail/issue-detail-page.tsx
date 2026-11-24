import type { IssueRecord } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { ArrowLeft, ChevronDown, ChevronUp, ClipboardCopy } from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FindInDocumentButton } from "@/app/layout/find-in-document-button";
import { PanelToolbar } from "@/app/layout/panel-toolbar";
import { TitlebarIconButton } from "@/app/layout/titlebar-icon-button";
import {
  MarkdownBodyEditor,
  type MarkdownBodyEditorHandle,
} from "@/components/markdown-body-editor";
import { ScrollArea, Text } from "@/components/ui";
import { copyIssueAgentPrompt } from "../copy-issue-agent-prompt";
import {
  type IssueDetailState,
  saveIssueDetailAtom,
} from "../issue-detail-store";
import { IssueActivity } from "./issue-activity";
import { IssueDetailSections } from "./issue-detail-sections";
import type { IssueDetailActions } from "./issue-dialog-types";
import { type IssueFieldOptions, IssueFieldRow } from "./issue-field-row";
import { useIssueStepShortcuts } from "./use-issue-step-shortcuts";
import { useIssueTextAutosave } from "./use-issue-text-autosave";

export interface IssueDetailStepper {
  position: number;
  total: number;
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
}

export function IssueDetailPage({
  state,
  viewTitle,
  options,
  actions,
  leading,
  stepper,
  onBack,
}: {
  state: IssueDetailState;
  viewTitle: string;
  options: IssueFieldOptions;
  actions: IssueDetailActions;
  leading?: ReactNode;
  stepper: IssueDetailStepper | null;
  onBack: () => void;
}) {
  const { t } = useTranslation("issues");
  const saveDetail = useSetAtom(saveIssueDetailAtom);
  const { card, detail, bodyEpoch, bodyStatus } = state;
  useIssueStepShortcuts(stepper?.onPrevious ?? null, stepper?.onNext ?? null);
  const [findHost, setFindHost] = useState<HTMLElement | null>(null);

  return (
    <article
      ref={setFindHost}
      data-issue-id={card.id}
      aria-label={`${card.identifier} ${card.title}`}
      className="relative flex min-h-0 min-w-0 flex-1 flex-col"
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
        <div className="ms-auto flex shrink-0 items-center gap-0.5">
          <TitlebarIconButton
            aria-label={t("cardMenu.copyAgentPrompt")}
            onClick={() => {
              void copyIssueAgentPrompt(card.id);
            }}
          >
            <ClipboardCopy className="size-3.5" />
          </TitlebarIconButton>
          <FindInDocumentButton />
          {stepper ? <IssueStepControls stepper={stepper} /> : null}
        </div>
      </PanelToolbar>
      <ScrollArea className="min-h-0 flex-1">
        <div className="@container/issue">
          <div className="mx-auto grid w-full max-w-3xl grid-cols-1 pb-10 @4xl/issue:max-w-5xl @4xl/issue:grid-cols-[minmax(0,1fr)_15rem] @4xl/issue:grid-rows-[auto_1fr] @4xl/issue:gap-x-4 @4xl/issue:pe-5">
            <IssueTextFields
              key={`${card.id}-${bodyEpoch}`}
              card={card}
              bodyStatus={bodyStatus}
              findHost={findHost}
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
              layout="adaptive"
            />
            {detail ? (
              <div className="flex min-w-0 flex-col">
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
              </div>
            ) : null}
          </div>
        </div>
      </ScrollArea>
    </article>
  );
}

function IssueStepControls({ stepper }: { stepper: IssueDetailStepper }) {
  const { t } = useTranslation("issues");
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Text
        size="meta"
        className="ms-1 me-1 tabular-nums text-editor-fg-subtle"
      >
        {stepper.position} / {stepper.total}
      </Text>
      <TitlebarIconButton
        aria-label={t("detail.previousIssue")}
        tooltip={t("detail.stepTooltip", {
          action: t("detail.previousIssue"),
          key: "K",
        })}
        disabled={stepper.onPrevious === null}
        onClick={() => stepper.onPrevious?.()}
      >
        <ChevronUp className="size-3.5" />
      </TitlebarIconButton>
      <TitlebarIconButton
        aria-label={t("detail.nextIssue")}
        tooltip={t("detail.stepTooltip", {
          action: t("detail.nextIssue"),
          key: "J",
        })}
        disabled={stepper.onNext === null}
        onClick={() => stepper.onNext?.()}
      >
        <ChevronDown className="size-3.5" />
      </TitlebarIconButton>
    </div>
  );
}

function IssueTextFields({
  card,
  bodyStatus,
  findHost,
  onSave,
}: {
  card: IssueRecord;
  bodyStatus: IssueDetailState["bodyStatus"];
  findHost: HTMLElement | null;
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
    <div className="flex min-w-0 flex-col gap-2 px-5 pt-8 pb-2">
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
        className="w-full border-0 bg-transparent text-title font-semibold text-editor-fg outline-none placeholder:text-editor-fg-subtle"
      />
      {bodyStatus === "ready" ? (
        <MarkdownBodyEditor
          ref={descriptionRef}
          initialMarkdown={card.description ?? ""}
          placeholder={t("dialog.descriptionPlaceholder")}
          className="min-h-16"
          findHost={findHost}
          onChange={() => autosave.scheduleDescription(descriptionRef.current)}
        />
      ) : (
        <div className="min-h-16">
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
