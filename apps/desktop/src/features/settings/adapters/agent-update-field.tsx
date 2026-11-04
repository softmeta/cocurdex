import type { AcpRegistryAgentUpdate } from "@cocurdex/shared";
import { Download } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Spinner, Text } from "@/components/ui";
import { desktopApi } from "@/lib";

export function AgentUpdateField({
  agentLabel,
  onUpdated,
  update,
}: {
  agentLabel: string;
  onUpdated(): Promise<void>;
  update: AcpRegistryAgentUpdate;
}) {
  const { t } = useTranslation("settings");
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runUpdate = async () => {
    setUpdating(true);
    setError(null);
    try {
      await desktopApi.updateAcpRegistryAgent(update.agentId);
      toast.success(
        t("adapters.toast.updated", {
          agent: agentLabel,
          version: update.latestVersion,
        }),
      );
      await onUpdated();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : String(updateError),
      );
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      <Text size="meta" tone="muted">
        {t("adapters.update.available", {
          installed: update.installedVersion,
          latest: update.latestVersion,
        })}
      </Text>
      <Button
        className="-ms-2"
        disabled={updating}
        onClick={() => void runUpdate()}
        size="xs"
        type="button"
        variant="ghost"
      >
        {updating ? <Spinner size="xs" /> : <Download className="size-3.5" />}
        {t("adapters.update.action", { version: update.latestVersion })}
      </Button>
      {error ? (
        <Text className="break-words" size="meta" tone="destructive">
          {error}
        </Text>
      ) : null}
    </>
  );
}
