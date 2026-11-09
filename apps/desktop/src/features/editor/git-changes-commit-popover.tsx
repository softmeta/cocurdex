import {
  ArrowUpFromLine,
  GitCommitHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { IconButton } from "@/components/ui/icon-button";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Text } from "@/components/ui/text";
import { Textarea } from "@/components/ui/textarea";

export type GitCommitAction = "commit" | "commitAndPush" | "push";
export interface GitCommitActionResult {
  committed: boolean;
  completed: boolean;
}

interface GitChangesCommitPopoverProps {
  currentBranch: string | null;
  hasChanges: boolean;
  parentBusy?: boolean;
  onAction: (
    action: GitCommitAction,
    options: { message: string; includeUnstaged: boolean },
  ) => Promise<GitCommitActionResult> | GitCommitActionResult;
  onGenerateMessage: (options: {
    includeUnstaged: boolean;
  }) => Promise<string | null>;
}

export function GitChangesCommitPopover({
  currentBranch,
  hasChanges,
  parentBusy = false,
  onAction,
  onGenerateMessage,
}: GitChangesCommitPopoverProps) {
  const { t } = useTranslation("editor");
  const includeUnstagedId = useId();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [includeUnstaged, setIncludeUnstaged] = useState(true);
  const [activeAction, setActiveAction] = useState<GitCommitAction | null>(
    null,
  );
  const [isGenerating, setIsGenerating] = useState(false);

  const actionPending = activeAction !== null;
  const inFlight = actionPending || isGenerating;
  const busy = inFlight || parentBusy;
  const trimmedMessage = message.trim();
  const canCommit = !busy && hasChanges;
  const canPush = !busy;

  const runAction = async (action: GitCommitAction) => {
    setActiveAction(action);
    try {
      const result = await onAction(action, {
        message: trimmedMessage,
        includeUnstaged,
      });
      if (result.committed) {
        setMessage("");
      }
      if (result.completed) {
        setOpen(false);
      }
    } catch {
    } finally {
      setActiveAction(null);
    }
  };

  const runGenerate = async () => {
    setIsGenerating(true);
    try {
      const generated = await onGenerateMessage({ includeUnstaged });
      if (generated !== null) {
        setMessage(generated);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const popoverOpen = open && (inFlight || hasChanges);

  return (
    <Popover
      onOpenChange={(next) => {
        if (inFlight) {
          return;
        }
        if (!hasChanges) {
          setOpen(false);
          return;
        }
        setOpen(next);
      }}
      open={popoverOpen}
    >
      <PopoverTrigger
        render={
          <IconButton
            aria-label={t("git.commitOrPush")}
            className="app-no-drag text-editor-fg-subtle hover:text-editor-fg data-[state=open]:text-editor-fg"
            disabled={!open && (!hasChanges || parentBusy)}
            size="sm"
          >
            {actionPending ? (
              <Spinner className="size-3.5" />
            ) : (
              <GitCommitHorizontal className="size-3.5" />
            )}
          </IconButton>
        }
      />
      <PopoverContent
        align="end"
        aria-busy={inFlight || undefined}
        className="w-80 gap-0 rounded-card p-0"
        side="bottom"
        sideOffset={6}
      >
        <div className="flex flex-col gap-2.5 p-3">
          <div className="flex min-w-0 items-center gap-2">
            {currentBranch ? (
              <Text
                className="min-w-0 flex-1 truncate font-medium"
                size="meta"
                tone="muted"
              >
                {currentBranch}
              </Text>
            ) : (
              <span className="min-w-0 flex-1" />
            )}
            <IconButton
              tooltip={
                isGenerating
                  ? t("git.generatingCommitMessage")
                  : t("git.generateCommitMessage")
              }
              aria-label={t("git.generateCommitMessage")}
              className="text-muted-foreground hover:text-foreground"
              disabled={busy || !hasChanges}
              onClick={() => void runGenerate()}
              size="xs"
            >
              {isGenerating ? (
                <Spinner className="size-3.5" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
            </IconButton>
          </div>
          <Textarea
            aria-label={t("git.commitMessage")}
            className="min-h-20 resize-none rounded-control"
            disabled={busy}
            onChange={(event) => setMessage(event.target.value)}
            placeholder={t("git.commitMessagePlaceholder")}
            value={message}
          />
          <div className="flex items-center gap-2">
            <Checkbox
              checked={includeUnstaged}
              disabled={busy}
              id={includeUnstagedId}
              onCheckedChange={(value) => setIncludeUnstaged(value === true)}
            />
            <Label
              className="text-muted-foreground font-normal"
              htmlFor={includeUnstagedId}
            >
              <Text size="meta">{t("git.includeUnstaged")}</Text>
            </Label>
          </div>
        </div>
        <div className="border-t border-border py-1">
          <CommitMenuItem
            disabled={!canCommit && activeAction !== "commit"}
            icon={<GitCommitHorizontal className="size-4" />}
            label={t("git.commit")}
            onClick={() => void runAction("commit")}
            pending={activeAction === "commit"}
          />
          <CommitMenuItem
            disabled={!canCommit && activeAction !== "commitAndPush"}
            icon={<Upload className="size-4" />}
            label={t("git.commitAndPush")}
            onClick={() => void runAction("commitAndPush")}
            pending={activeAction === "commitAndPush"}
          />
          <CommitMenuItem
            disabled={!canPush && activeAction !== "push"}
            icon={<ArrowUpFromLine className="size-4" />}
            label={t("git.push")}
            onClick={() => void runAction("push")}
            pending={activeAction === "push"}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CommitMenuItem({
  disabled,
  icon,
  label,
  onClick,
  pending,
}: {
  disabled: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  pending: boolean;
}) {
  return (
    <Button
      aria-busy={pending || undefined}
      className="h-auto w-full justify-start rounded-none px-3 py-2 text-start font-normal"
      disabled={disabled}
      onClick={onClick}
      variant="ghost"
    >
      <span className="text-muted-foreground">
        {pending ? <Spinner className="size-4" /> : icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Button>
  );
}
