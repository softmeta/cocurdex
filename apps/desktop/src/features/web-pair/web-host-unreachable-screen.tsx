import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CocurdexMark } from "@/components/cocurdex-mark";
import { Button, Text } from "@/components/ui";
import type { PairedHostFailure } from "./paired-host-reach";
import { useApprovalPoll } from "./use-approval-poll";

export interface UnreachableHost {
  name: string;
  safetyCode: string;
  forget?: () => Promise<void>;
}

interface WebHostUnreachableScreenProps {
  host: UnreachableHost;
  failure: PairedHostFailure;
}

function reloadPage() {
  window.location.reload();
}

export function WebHostUnreachableScreen({
  host,
  failure,
}: WebHostUnreachableScreenProps) {
  if (failure === "pending") return <WebHostPendingScreen host={host} />;
  return <WebHostFailureScreen failure={failure} host={host} />;
}

function WebHostPendingScreen({ host }: { host: UnreachableHost }) {
  const { t } = useTranslation();
  useApprovalPoll(reloadPage);

  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4 text-app-foreground">
      <div className="flex w-full max-w-sm flex-col gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <CocurdexMark className="size-7" />
            <Text as="h1" size="title" weight="medium">
              {t("webHostPending.title")}
            </Text>
          </div>
          <Text size="body" tone="muted">
            {t("webHostPending.description", { name: host.name })}
          </Text>
        </div>
        <Text
          aria-label={t("webHostPending.codeLabel")}
          as="p"
          className="font-mono tabular-nums tracking-widest"
          size="display"
          weight="medium"
        >
          {host.safetyCode}
        </Text>
        <Text size="meta" tone="muted">
          {t("webHostPending.waiting")}
        </Text>
        {host.forget ? (
          <ForgetHostButton forget={host.forget} variant="outline" />
        ) : null}
      </div>
    </main>
  );
}

function ForgetHostButton({
  forget: forgetHost,
  variant,
}: {
  forget: () => Promise<void>;
  variant: "default" | "outline";
}) {
  const { t } = useTranslation();
  const [forgetting, setForgetting] = useState(false);
  const [forgetFailed, setForgetFailed] = useState(false);

  const forget = async () => {
    setForgetting(true);
    setForgetFailed(false);
    try {
      await forgetHost();
      window.location.reload();
    } catch {
      setForgetFailed(true);
      setForgetting(false);
    }
  };

  return (
    <>
      <Button
        disabled={forgetting}
        variant={variant}
        onClick={() => void forget()}
      >
        {t("webHostUnreachable.forget")}
      </Button>
      {forgetFailed ? (
        <Text size="meta" tone="destructive">
          {t("webHostUnreachable.forgetFailed")}
        </Text>
      ) : null}
    </>
  );
}

function WebHostFailureScreen({
  host,
  failure,
}: {
  host: UnreachableHost;
  failure: Exclude<PairedHostFailure, "pending">;
}) {
  const { t } = useTranslation();
  const descriptions: Record<typeof failure, string> = {
    offline: t("webHostUnreachable.offline", { name: host.name }),
    revoked: t("webHostUnreachable.revoked", { name: host.name }),
    unreachable: t("webHostUnreachable.unreachable", { name: host.name }),
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
            <Button onClick={reloadPage}>
              {t("webHostUnreachable.retry")}
            </Button>
          )}
          {host.forget ? (
            <ForgetHostButton
              forget={host.forget}
              variant={failure === "revoked" ? "default" : "outline"}
            />
          ) : null}
        </div>
      </div>
    </main>
  );
}
