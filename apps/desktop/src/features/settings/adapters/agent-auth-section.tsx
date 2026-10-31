import type { AcpRegistryAgentId, AgentAuthState } from "@cocurdex/shared";
import { LogIn, LogOut, RotateCw, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { AppConfirmDialog, AppSelect } from "@/components/app";
import { Button, Text } from "@/components/ui";
import { invalidateProviderModelCache } from "@/features/sessions";
import { desktopApi } from "@/lib";

type LoginPhase =
  | { kind: "idle" }
  | { kind: "signing-in"; methodId: string }
  | { kind: "failed"; methodId: string; message: string };

type PendingConfirm =
  | { kind: "switch"; methodId: string }
  | { kind: "logout" }
  | null;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function isCancelled(error: unknown) {
  return errorMessage(error).includes("login was cancelled");
}

function currentMethodId(auth: AgentAuthState) {
  return auth.preferredMethodId ?? auth.loginMethodId;
}

function methodName(auth: AgentAuthState, methodId: string | null) {
  return auth.methods.find((method) => method.id === methodId)?.name ?? "";
}

export function useAgentAuthQuery(agentId: AcpRegistryAgentId) {
  return useSWR(
    ["agent.auth.read", agentId],
    () => desktopApi.readAgentAuth(agentId),
    { dedupingInterval: 0, revalidateOnFocus: false },
  );
}

export function AgentAuthSection({
  agentId,
  agentLabel,
}: {
  agentId: AcpRegistryAgentId;
  agentLabel: string;
}) {
  const { t } = useTranslation("settings");
  const { data: auth, error, isLoading, mutate } = useAgentAuthQuery(agentId);
  const [phase, setPhase] = useState<LoginPhase>({ kind: "idle" });
  const [confirm, setConfirm] = useState<PendingConfirm>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  if (isLoading) {
    return (
      <Text size="meta" tone="muted">
        {t("adapters.auth.reading")}
      </Text>
    );
  }
  if (!auth) {
    return (
      <div className="flex min-w-0 flex-col items-start gap-1">
        <Text className="break-words" size="meta" tone="destructive">
          {t("adapters.auth.readFailed", { message: errorMessage(error) })}
        </Text>
        <Button
          className="-ms-2"
          onClick={() => void mutate()}
          size="xs"
          type="button"
          variant="ghost"
        >
          <RotateCw className="size-3.5" />
          {t("adapters.auth.retry")}
        </Button>
      </div>
    );
  }

  const activeMethodId = currentMethodId(auth);
  const selectedMethodId =
    phase.kind === "signing-in" ? phase.methodId : activeMethodId;

  const login = async (methodId: string) => {
    setPhase({ kind: "signing-in", methodId });
    try {
      await desktopApi.loginAgent(agentId, methodId);
      invalidateProviderModelCache();
      setPhase({ kind: "idle" });
      await mutate();
    } catch (loginError) {
      setPhase(
        isCancelled(loginError)
          ? { kind: "idle" }
          : { kind: "failed", methodId, message: errorMessage(loginError) },
      );
    }
  };

  const chooseMethod = (methodId: string) => {
    if (methodId === activeMethodId) {
      return;
    }
    if (auth.liveSessionCount > 0) {
      setConfirm({ kind: "switch", methodId });
      return;
    }
    void login(methodId);
  };

  const logout = async () => {
    setLoggingOut(true);
    setPhase({ kind: "idle" });
    try {
      await desktopApi.logoutAgent(agentId);
      invalidateProviderModelCache();
      await mutate();
    } catch (logoutError) {
      setPhase({
        kind: "failed",
        methodId: activeMethodId ?? "",
        message: errorMessage(logoutError),
      });
    } finally {
      setLoggingOut(false);
    }
  };

  const confirmDescription = () => {
    const values = { agent: agentLabel, count: auth.liveSessionCount };
    if (confirm?.kind === "logout") {
      return auth.liveSessionCount > 0
        ? t("adapters.auth.logoutDescriptionSessions", values)
        : t("adapters.auth.logoutDescription", values);
    }
    return t("adapters.auth.switchDescription", values);
  };

  const busy = phase.kind === "signing-in" || loggingOut;
  let note: { text: string; tone: "muted" | "destructive" } | null = null;
  if (phase.kind === "signing-in") {
    note = {
      text: t("adapters.auth.signingIn", {
        method: methodName(auth, phase.methodId),
      }),
      tone: "muted",
    };
  } else if (phase.kind === "failed") {
    note = {
      text: activeMethodId
        ? t("adapters.auth.failedKeeping", {
            message: phase.message,
            method: methodName(auth, activeMethodId),
          })
        : phase.message,
      tone: "destructive",
    };
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {auth.methods.length > 0 ? (
          <AppSelect
            disabled={busy}
            onValueChange={chooseMethod}
            options={auth.methods.map((method) => ({
              value: method.id,
              label: method.name,
              description: method.description ?? undefined,
            }))}
            triggerAriaLabel={t("adapters.auth.method")}
            value={selectedMethodId ?? ""}
          />
        ) : null}
        {phase.kind === "signing-in" ? (
          <Button
            onClick={() => void desktopApi.cancelAgentLogin(agentId)}
            size="xs"
            type="button"
            variant="ghost"
          >
            <X className="size-3.5" />
            {t("adapters.auth.cancel")}
          </Button>
        ) : null}
        {phase.kind === "failed" && phase.methodId ? (
          <Button
            onClick={() => void login(phase.methodId)}
            size="xs"
            type="button"
            variant="ghost"
          >
            <RotateCw className="size-3.5" />
            {t("adapters.auth.retry")}
          </Button>
        ) : null}
        {phase.kind === "idle" && selectedMethodId ? (
          <Button
            disabled={busy}
            onClick={() => void login(selectedMethodId)}
            size="xs"
            type="button"
            variant="ghost"
          >
            <LogIn className="size-3.5" />
            {t("adapters.auth.login")}
          </Button>
        ) : null}
        {phase.kind !== "signing-in" && auth.logoutSupported ? (
          <Button
            disabled={busy}
            onClick={() => setConfirm({ kind: "logout" })}
            size="xs"
            type="button"
            variant="ghost"
          >
            <LogOut className="size-3.5" />
            {t("adapters.auth.logout")}
          </Button>
        ) : null}
      </div>
      {note ? (
        <Text
          aria-live="polite"
          className="break-words"
          size="meta"
          tone={note.tone}
        >
          {note.text}
        </Text>
      ) : null}
      <AppConfirmDialog
        cancelLabel={t("adapters.auth.confirmCancel")}
        confirmLabel={
          confirm?.kind === "logout"
            ? t("adapters.auth.logoutConfirm")
            : t("adapters.auth.switchConfirm")
        }
        description={confirmDescription()}
        onConfirm={() => {
          if (confirm?.kind === "logout") {
            void logout();
          } else if (confirm?.kind === "switch") {
            void login(confirm.methodId);
          }
        }}
        onOpenChange={(open) => {
          if (!open) {
            setConfirm(null);
          }
        }}
        open={confirm !== null}
        title={
          confirm?.kind === "logout"
            ? t("adapters.auth.logoutTitle", { agent: agentLabel })
            : t("adapters.auth.switchTitle")
        }
        variant={confirm?.kind === "logout" ? "destructive" : "default"}
      />
    </div>
  );
}
