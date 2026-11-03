import type { SavedHost } from "@cocurdex/client-runtime";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CocurdexMark } from "@/components/cocurdex-mark";
import { Button, Text } from "@/components/ui";
import { removePairedHost } from "@/lib";
import type { PairedHostFailure } from "./paired-host-reach";

interface WebHostUnreachableScreenProps {
  host: SavedHost;
  failure: PairedHostFailure;
}

export function WebHostUnreachableScreen({
  host,
  failure,
}: WebHostUnreachableScreenProps) {
  const { t } = useTranslation();
  const [forgetting, setForgetting] = useState(false);
  const [forgetFailed, setForgetFailed] = useState(false);

  const descriptions: Record<PairedHostFailure, string> = {
    offline: t("webHostUnreachable.offline", { name: host.name }),
    revoked: t("webHostUnreachable.revoked", { name: host.name }),
    unreachable: t("webHostUnreachable.unreachable", { name: host.name }),
  };

  const forget = async () => {
    setForgetting(true);
    setForgetFailed(false);
    try {
      await removePairedHost(host.hostId);
      window.location.reload();
    } catch {
      setForgetFailed(true);
      setForgetting(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4 text-app-foreground">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <CocurdexMark className="size-7" />
            <Text as="h1" size="title" weight="medium">
              {t("webHostUnreachable.title")}
            </Text>
          </div>
          <Text size="body" tone="muted">
            {descriptions[failure]}
          </Text>
        </div>
        <div className="flex flex-col gap-2">
          {failure === "revoked" ? null : (
            <Button onClick={() => window.location.reload()}>
              {t("webHostUnreachable.retry")}
            </Button>
          )}
          <Button
            disabled={forgetting}
            variant={failure === "revoked" ? "default" : "outline"}
            onClick={() => void forget()}
          >
            {t("webHostUnreachable.forget")}
          </Button>
          {forgetFailed ? (
            <Text size="meta" tone="destructive">
              {t("webHostUnreachable.forgetFailed")}
            </Text>
          ) : null}
        </div>
      </div>
    </main>
  );
}
