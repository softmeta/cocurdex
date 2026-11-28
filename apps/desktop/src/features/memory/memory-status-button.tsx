import { Brain } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppRailIconButton } from "@/components/app";
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
import { useMemoryOnboarding } from "./memory-onboarding-state";

const HOVER_OPEN_DELAY_MS = 200;
const HOVER_CLOSE_DELAY_MS = 80;

export function MemoryStatusButton() {
  const { t } = useTranslation("memory");
  const { stage, status, failure, enable } = useMemoryOnboarding();
  const [open, setOpen] = useState(false);

  if (stage !== "installing" && stage !== "failed") return null;

  const name = status?.settings.provider ?? "rsrs";
  const stateLabel =
    stage === "installing"
      ? t("onboarding.state.installing")
      : t("onboarding.state.failed", { name });

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        asChild
        closeDelay={HOVER_CLOSE_DELAY_MS}
        delay={HOVER_OPEN_DELAY_MS}
        openOnHover
      >
        <AppRailIconButton
          aria-busy={stage === "installing"}
          aria-label={t("onboarding.label")}
          dot={
            <span
              className={cn(
                "absolute end-1.5 bottom-1.5 size-1.5 rounded-full ring-2 ring-sidebar",
                {
                  "bg-destructive": stage === "failed",
                  "animate-pulse bg-muted-foreground/40":
                    stage === "installing",
                },
              )}
            />
          }
          tooltip={false}
        >
          <Brain className="size-4" />
        </AppRailIconButton>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-card" side="right">
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
                className="size-1.5 shrink-0 rounded-full bg-destructive"
              />
            )}
            <Text className="min-w-0 flex-1 truncate" size="meta" tone="muted">
              {stateLabel}
            </Text>
            {stage === "failed" ? (
              <Button onClick={() => void enable()} size="sm" variant="ghost">
                {t("onboarding.retry")}
              </Button>
            ) : null}
          </div>
          {stage === "failed" ? (
            <Text className="text-destructive" size="meta">
              {failure ?? t("onboarding.failed", { name })}
            </Text>
          ) : null}
        </section>
      </PopoverContent>
    </Popover>
  );
}
