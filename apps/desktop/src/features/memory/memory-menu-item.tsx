import { DEFAULT_MEMORY_SETTINGS, type MemoryStatus } from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { Brain, Settings2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { mutate } from "swr";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Text,
} from "@/components/ui";
import { openSettings } from "@/features/settings/settings-navigation";
import { cn, desktopApi } from "@/lib";
import {
  MEMORY_SETTINGS_KEY,
  MEMORY_STATUS_KEY,
  revalidateMemory,
  useMemoryStatus,
} from "./memory-queries";

function statusNote(t: TFunction<"memory">, status: MemoryStatus | undefined) {
  if (!status) return null;
  if (!status.supported) return t("status.unsupported");
  if (status.installation === "installing") return t("status.installing");
  if (status.available) return null;
  if (status.installation === "failed") return t("status.failed");
  return t("status.missing");
}

export function MemoryMenuItem({
  onConnectCloud,
}: {
  onConnectCloud(user: string | null): void;
}) {
  const { t } = useTranslation("memory");
  const { data } = useMemoryStatus();
  const [pending, setPending] = useState(false);
  const enabled = data?.settings.enabled ?? true;
  const installing = data?.installation === "installing";
  const available = data?.available;
  const unsupported = data?.supported === false;
  const note = statusNote(t, data);
  const cloud = data?.cloud;
  const syncEnabled = Boolean(cloud?.connected && cloud.autosync);

  const toggleMemory = async (next: boolean) => {
    setPending(true);
    const settings = data?.settings ?? DEFAULT_MEMORY_SETTINGS;
    const optimistic = { ...settings, enabled: next };
    try {
      await Promise.all([
        mutate(MEMORY_SETTINGS_KEY, optimistic, { revalidate: false }),
        mutate(
          MEMORY_STATUS_KEY,
          (current: MemoryStatus | undefined) =>
            current
              ? { ...current, settings: optimistic, enabled: next }
              : current,
          { revalidate: false },
        ),
      ]);
      const saved = await desktopApi.setMemorySettings(optimistic);
      await mutate(MEMORY_SETTINGS_KEY, saved, { revalidate: false });
      if (next && !available) {
        void desktopApi.installMemory();
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("switch.toggleFailed"),
      );
    } finally {
      setPending(false);
      void revalidateMemory().catch(() => undefined);
    }
  };

  const toggleSync = async (next: boolean) => {
    if (next && !cloud?.connected) {
      onConnectCloud(cloud?.user ?? null);
      return;
    }
    setPending(true);
    try {
      await desktopApi.setMemoryCloudSync(next);
      await revalidateMemory();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("switch.syncToggleFailed"),
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Brain className="size-4 shrink-0" />
        <span className="flex min-w-0 flex-1 items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn("size-1.5 shrink-0 rounded-full", {
              "bg-status-success": available === true,
              "bg-status-warning": installing,
              "bg-destructive": data?.installation === "failed",
              "bg-muted-foreground/40":
                !installing &&
                available !== true &&
                data?.installation !== "failed",
            })}
          />
          <span className="min-w-0 flex-1 truncate">{t("switch.label")}</span>
          {note ? (
            <Text as="span" className="shrink-0" size="meta" tone="muted">
              {note}
            </Text>
          ) : null}
        </span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        <DropdownMenuCheckboxItem
          checked={enabled}
          closeOnClick={false}
          disabled={pending || installing || unsupported}
          onCheckedChange={(checked) => void toggleMemory(checked === true)}
        >
          {t("menu.enable")}
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={syncEnabled}
          closeOnClick={!cloud?.connected}
          disabled={
            pending || installing || unsupported || !available || !enabled
          }
          onCheckedChange={(checked) => void toggleSync(checked === true)}
        >
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="min-w-0 truncate">{t("menu.sync")}</span>
            {cloud?.connected ? (
              <Text as="span" className="shrink-0" size="meta" tone="muted">
                {cloud.user}
              </Text>
            ) : null}
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openSettings("memory")}>
          <Settings2 className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{t("menu.settings")}</span>
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
