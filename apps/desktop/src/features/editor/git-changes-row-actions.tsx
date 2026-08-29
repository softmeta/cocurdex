import { Undo2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GitFileStagedState } from "@/lib";

interface GitChangeRowActionsProps {
  path: string;
  stagedState: GitFileStagedState;
  onStage: (path: string) => void;
  onUnstage: (path: string) => void;
  onDiscard: (path: string) => void;
}

// Trailing controls for a changed-file header: a stage checkbox (always shown,
// since it doubles as the staged-state indicator) and a hover-revealed discard
// button guarded by a confirmation dialog.
export function GitChangeRowActions({
  path,
  stagedState,
  onStage,
  onUnstage,
  onDiscard,
}: GitChangeRowActionsProps) {
  const { t } = useTranslation("editor");
  const fullyStaged = stagedState === "staged";
  const stageLabel = fullyStaged ? t("git.unstageFile") : t("git.stageFile");

  return (
    <div className="app-no-drag flex items-center gap-1">
      <DiscardFileButton onDiscard={onDiscard} path={path} />
      <Tooltip>
        <TooltipTrigger
          aria-label={stageLabel}
          render={
            <Checkbox
              checked={stagedState !== "unstaged"}
              indeterminate={stagedState === "partial"}
              onCheckedChange={() =>
                fullyStaged ? onUnstage(path) : onStage(path)
              }
            />
          }
        />
        <TooltipContent side="top" sideOffset={6}>
          {stageLabel}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

function DiscardFileButton({
  path,
  onDiscard,
}: {
  path: string;
  onDiscard: (path: string) => void;
}) {
  const { t } = useTranslation("editor");
  const [open, setOpen] = useState(false);
  const label = t("git.discardChanges");
  const fileName = path.split("/").pop() ?? path;

  return (
    <>
      <Tooltip>
        <TooltipTrigger
          aria-label={label}
          render={
            <IconButton
              aria-label={label}
              className="text-editor-fg-subtle opacity-0 transition-opacity hover:text-editor-fg focus-visible:opacity-100 group-hover:opacity-100"
              onClick={() => setOpen(true)}
              size="xs"
            >
              <Undo2 className="size-3.5" />
            </IconButton>
          }
        />
        <TooltipContent side="top" sideOffset={6}>
          {label}
        </TooltipContent>
      </Tooltip>
      <Dialog onOpenChange={setOpen} open={open}>
        <DialogContent size="compact">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {t("git.discardConfirm", { file: fileName })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={<Button variant="ghost">{t("git.cancel")}</Button>}
            />
            <Button
              onClick={() => {
                onDiscard(path);
                setOpen(false);
              }}
              variant="destructive"
            >
              {t("git.discard")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
