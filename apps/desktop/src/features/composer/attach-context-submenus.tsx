import type {
  AgentSlashCommand,
  ContextItemAttachment,
} from "@cocurdex/shared";
import { DEFAULT_VIEW_ID } from "@cocurdex/shared";
import { FileText, ListTodo, type LucideIcon, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Input,
} from "@/components/ui";
import { desktopApi } from "@/lib";
import { MenuRowSidecar } from "./menu-row-sidecar";
import { SlashCommandPreview } from "./slash-command-preview";

interface PickerItem {
  id: string;
  label: string;
  description?: string;
  select(): void;
}

function PickerSubmenu({
  icon: Icon,
  label,
  load,
}: {
  icon: LucideIcon;
  label: string;
  load(): Promise<PickerItem[]>;
}) {
  const { t } = useTranslation("sessions");
  const [items, setItems] = useState<PickerItem[] | null>(null);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState<{
    description: string;
    row: HTMLElement;
  } | null>(null);
  const needle = query.trim().toLowerCase();
  const visible = (items ?? []).filter(
    (item) => !needle || item.label.toLowerCase().includes(needle),
  );

  const handleOpenChange = (open: boolean) => {
    setPreview(null);
    if (!open) return;
    setQuery("");
    load()
      .then(setItems)
      .catch(() => setItems([]));
  };

  return (
    <DropdownMenuSub onOpenChange={handleOpenChange}>
      <DropdownMenuSubTrigger>
        <Icon className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="flex max-h-80 [--popup-max-width:18rem] flex-col overflow-hidden">
        <Input
          autoFocus
          className="mb-1 h-8 shrink-0"
          placeholder={t("composer.attachMenu.search")}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.map((item) => (
            <DropdownMenuItem
              key={item.id}
              onClick={item.select}
              onFocus={(event) => {
                const description = item.description?.trim();
                setPreview(
                  description
                    ? { description, row: event.currentTarget }
                    : null,
                );
              }}
            >
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </DropdownMenuItem>
          ))}
          {items !== null && visible.length === 0 ? (
            <div className="px-1.5 py-1 text-meta text-muted-foreground">
              {t("composer.attachMenu.empty")}
            </div>
          ) : null}
        </div>
      </DropdownMenuSubContent>
      {preview ? (
        <MenuRowSidecar reference={preview.row}>
          <SlashCommandPreview description={preview.description} />
        </MenuRowSidecar>
      ) : null}
    </DropdownMenuSub>
  );
}

export function AttachContextSubmenus({
  loadSkills,
  onInsertContext,
  onSelectSkill,
}: {
  loadSkills(): Promise<AgentSlashCommand[]>;
  onInsertContext(attachment: ContextItemAttachment): void;
  onSelectSkill(command: AgentSlashCommand): void;
}) {
  const { t } = useTranslation("sessions");

  const attachIssue = async (id: string) => {
    const issue = await desktopApi.issueGet({ id });
    if (!issue) return;
    onInsertContext({
      kind: "context-item",
      itemKind: "issue",
      id: issue.id,
      title: issue.title,
      body: [
        `Status: ${issue.status}`,
        `Priority: ${issue.priority}`,
        "",
        issue.description ?? "",
      ].join("\n"),
    });
  };

  const attachNote = async (id: string) => {
    const note = await desktopApi.notesGet({ id });
    if (!note) return;
    onInsertContext({
      kind: "context-item",
      itemKind: "note",
      id: note.id,
      title: note.title,
      body: note.bodyMarkdown,
    });
  };

  return (
    <>
      <PickerSubmenu
        icon={Sparkles}
        label={t("composer.attachMenu.skills")}
        load={async () =>
          (await loadSkills()).map((command) => ({
            id: command.name,
            label: command.name,
            description: command.description,
            select: () => onSelectSkill(command),
          }))
        }
      />
      <PickerSubmenu
        icon={ListTodo}
        label={t("composer.attachMenu.issues")}
        load={async () => {
          const view = await desktopApi.issueLoad({ viewId: DEFAULT_VIEW_ID });
          return (view?.issues ?? []).map((issue) => ({
            id: issue.id,
            label: issue.title,
            select: () => void attachIssue(issue.id),
          }));
        }}
      />
      <PickerSubmenu
        icon={FileText}
        label={t("composer.attachMenu.notes")}
        load={async () =>
          (await desktopApi.notesList())
            .filter((note) => note.kind === "note")
            .map((note) => ({
              id: note.id,
              label: note.title,
              select: () => void attachNote(note.id),
            }))
        }
      />
    </>
  );
}
