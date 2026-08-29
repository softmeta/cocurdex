import {
  ArrowUpFromLine,
  GitCommitHorizontal,
  Sparkles,
  Upload,
} from "lucide-react";
import { type ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AppDropdownTriggerButton,
  AppDropdownTriggerLabel,
} from "@/components";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type GitCommitAction = "commit" | "commitAndPush" | "push";
export interface GitCommitActionResult {
  committed: boolean;
  completed: boolean;
}

interface GitChangesCommitPopoverProps {
  currentBranch: string | null;
  // Unfiltered working-tree has changes. Disables opening when idle; never
  // force-closes the popover while an action is still loading.
  hasChanges: boolean;
  // External loading (diff refresh / stage). Does not close an in-flight popover.
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
  // Local flight owns loading for commit/push; parentBusy only blocks starting
  // something new while idle (e.g. diff refresh).
  const busy = inFlight || parentBusy;
  const trimmedMessage = message.trim();
  // Empty message is allowed when a commit-message model is configured in
  // Settings → Git; the main process runs a one-shot generation (no session).
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
      // Close only after full success (commit, push, or both). Keep open on
      // partial failure so the user can retry with the loading spinner gone.
      if (result.completed) {
        setOpen(false);
      }
    } catch {
      // Parent already toasted; keep the popover open so the user can retry.
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

  // Stay open for the whole loading flight even after the worktree goes clean
  // (parent reloads diff before onAction resolves). Idle + clean → closed.
  const popoverOpen = open && (inFlight || hasChanges);

  return (
    <Popover
      onOpenChange={(next) => {
        // Block dismiss (outside click / escape / trigger) while loading.
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
      <PopoverTrigger asChild>
        <AppDropdownTriggerButton
          appearance="ghost"
          aria-label={t("git.commitOrPush")}
          className="app-no-drag h-7 max-w-52 gap-1.5 px-2 text-meta"
          // Never disable the trigger while open: a disabled anchor can drop
          // the popover mid-flight when parentBusy flips on action start.
          disabled={!open && (!hasChanges || parentBusy)}
        >
          {actionPending ? (
            <Spinner className="size-3.5 shrink-0 text-muted-foreground" />
          ) : null}
          <AppDropdownTriggerLabel>
            {t("git.commitOrPush")}
          </AppDropdownTriggerLabel>
        </AppDropdownTriggerButton>
      </PopoverTrigger>
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
            <Tooltip>
              <TooltipTrigger
                render={
                  <IconButton
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
                }
              />
              <TooltipContent side="top" sideOffset={6}>
                {isGenerating
                  ? t("git.generatingCommitMessage")
                  : t("git.generateCommitMessage")}
              </TooltipContent>
            </Tooltip>
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
