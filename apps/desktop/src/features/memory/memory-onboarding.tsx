import { DEFAULT_MEMORY_SETTINGS, type MemoryStatus } from "@cocurdex/shared";
import { useAtom } from "jotai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Spinner, Text } from "@/components/ui";
import { cn, desktopApi } from "@/lib";
import { CloudSyncDialog } from "./cloud-sync-dialog";
import { memoryOnboardingSkippedAtom } from "./memory-onboarding-store";
import { revalidateMemory, useMemoryStatus } from "./memory-queries";

type OnboardingStage =
  | "hidden"
  | "offer"
  | "off"
  | "installing"
  | "failed"
  | "ready";

function onboardingStage(
  status: MemoryStatus | undefined,
  skipped: boolean,
  working: boolean,
): OnboardingStage {
  if (!status?.supported) return "hidden";
  if (working || status.installation === "installing") return "installing";
  if (status.settings.enabled && status.available) return "ready";
  if (status.settings.enabled && status.installation === "failed") {
    return "failed";
  }
  return skipped ? "off" : "offer";
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function MemoryOnboarding() {
  const { t } = useTranslation("memory");
  const { data: status } = useMemoryStatus();
  const [skipped, setSkipped] = useAtom(memoryOnboardingSkippedAtom);
  const [working, setWorking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const stage = onboardingStage(status, skipped, working);

  const enable = async () => {
    setWorking(true);
    setFailure(null);
    try {
      const settings = status?.settings ?? DEFAULT_MEMORY_SETTINGS;
      if (!settings.enabled) {
        await desktopApi.setMemorySettings({ ...settings, enabled: true });
      }
      if (!status?.available) {
        const result = await desktopApi.installMemory(true);
        if (!result.installed) setFailure(result.message);
      }
    } catch (error) {
      setFailure(errorMessage(error));
    } finally {
      setWorking(false);
      void revalidateMemory().catch(() => undefined);
    }
  };

  if (stage === "hidden") return null;

  if (stage === "offer") {
    return (
      <section
        aria-label={t("onboarding.title")}
        className="mx-3 mb-3 flex flex-col gap-1 rounded-card bg-sidebar-surface-hover p-3"
      >
        <Text size="body" weight="medium">
          {t("onboarding.title")}
        </Text>
        <Text size="meta" tone="muted">
          {t("onboarding.description")}
        </Text>
        <div className="mt-2 flex items-center justify-end gap-2">
          <Button onClick={() => setSkipped(true)} size="sm" variant="ghost">
            {t("onboarding.skip")}
          </Button>
          <Button onClick={() => void enable()} size="sm">
            {t("onboarding.enable")}
          </Button>
        </div>
      </section>
    );
  }

  const failedText = failure ?? status?.error ?? t("onboarding.failed");
  const stateLabel = {
    off: t("onboarding.state.off"),
    installing: t("onboarding.state.installing"),
    failed: t("onboarding.state.failed"),
    ready: t("onboarding.state.ready"),
  }[stage];
  const cloud = status?.cloud;

  return (
    <section
      aria-busy={stage === "installing"}
      aria-label={t("onboarding.label")}
      className="mx-3 mb-3 flex min-h-8 flex-col gap-1 px-1"
    >
      <div className="flex min-h-8 items-center gap-2">
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
        <Text className="min-w-0 flex-1 truncate" size="meta" tone="muted">
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
          <Button onClick={() => setSyncOpen(true)} size="sm" variant="ghost">
            {t("onboarding.sync")}
          </Button>
        ) : null}
      </div>
      {stage === "failed" ? (
        <Text className="text-destructive" size="meta">
          {failedText}
        </Text>
      ) : null}
      {syncOpen ? (
        <CloudSyncDialog
          initialUser={cloud?.user ?? null}
          onClose={() => setSyncOpen(false)}
        />
      ) : null}
    </section>
  );
}
