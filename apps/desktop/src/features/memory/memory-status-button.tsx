import { Brain } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppSidebarIconButton } from "@/components/app";
import {
  Button,
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
  Spinner,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";
import { CloudSyncDialog } from "./cloud-sync-dialog";
import { useMemoryOnboarding } from "./memory-onboarding-state";

const HOVER_OPEN_DELAY_MS = 200;
const HOVER_CLOSE_DELAY_MS = 80;

export function MemoryStatusButton() {
  const { t } = useTranslation("memory");
  const { stage, status, failure, enable } = useMemoryOnboarding();
  const [open, setOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);

  if (stage === "hidden" || stage === "offer") return null;

  const stateLabel = {
    off: t("onboarding.state.off"),
    installing: t("onboarding.state.installing"),
    failed: t("onboarding.state.failed"),
    ready: t("onboarding.state.ready"),
  }[stage];
  const cloud = status?.cloud;
  const openSync = () => {
    setOpen(false);
    setSyncOpen(true);
  };

  return (
    <>
      <Popover onOpenChange={setOpen} open={open}>
        <PopoverTrigger
          asChild
          closeDelay={HOVER_CLOSE_DELAY_MS}
          delay={HOVER_OPEN_DELAY_MS}
          openOnHover
        >
          <AppSidebarIconButton
            aria-busy={stage === "installing"}
            aria-label={t("onboarding.label")}
            tooltip={false}
          >
            <Brain className="size-3.5" />
            {stage === "ready" ? null : (
              <span
                className={cn(
                  "absolute end-1 bottom-1 size-1.5 rounded-full ring-2 ring-sidebar",
                  {
                    "bg-destructive": stage === "failed",
                    "bg-muted-foreground/40": stage === "off",
                    "animate-pulse bg-muted-foreground/40":
                      stage === "installing",
                  },
                )}
              />
            )}
          </AppSidebarIconButton>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 rounded-card" side="top">
          <section
            aria-busy={stage === "installing"}
            aria-label={t("onboarding.label")}
            className="flex flex-col gap-2"
          >
            <PopoverHeader>
              <PopoverTitle>{t("onboarding.label")}</PopoverTitle>
            </PopoverHeader>
            <div className="flex min-h-7 items-center gap-2">
              {stage === "installing" ? (
                <Spinner className="size-3.5 shrink-0" />
              ) : (
                <span
                  aria-hidden="true"
                  className={cn("size-1.5 shrink-0 rounded-full", {
                    "bg-status-success": stage === "ready",
                    "bg-destructive": stage === "failed",
                    "bg-muted-foreground/40": stage === "off",
                  })}
                />
              )}
              <Text
                className="min-w-0 flex-1 truncate"
                size="meta"
                tone="muted"
              >
                {stateLabel}
              </Text>
              {stage === "off" ? (
                <Button onClick={() => void enable()} size="sm" variant="ghost">
                  {t("onboarding.enable")}
                </Button>
              ) : null}
              {stage === "failed" ? (
                <Button onClick={() => void enable()} size="sm" variant="ghost">
                  {t("onboarding.retry")}
                </Button>
              ) : null}
              {stage === "ready" && !cloud?.connected ? (
                <Button onClick={openSync} size="sm" variant="ghost">
                  {t("onboarding.sync")}
                </Button>
              ) : null}
            </div>
            {stage === "failed" ? (
              <Text className="text-destructive" size="meta">
                {failure ?? t("onboarding.failed")}
              </Text>
            ) : null}
          </section>
        </PopoverContent>
      </Popover>
      {syncOpen ? (
        <CloudSyncDialog
          initialUser={cloud?.user ?? null}
          onClose={() => setSyncOpen(false)}
        />
      ) : null}
    </>
  );
}
