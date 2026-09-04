import type {
  ProviderAuthMethod,
  ProviderAuthMethodRecord,
  ProviderAuthPrompt,
  ProviderAuthState,
} from "@cocurdex/shared";
import { Check, KeyRound, LogIn, LogOut, X } from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Input, Spinner, Text } from "@/components/ui";
import { desktopApi, useMountEffect } from "@/lib";
import { SettingsSelect } from "../settings-select";
import { SettingsGroup } from "./settings-group";

function AuthMethodIcon({ method }: { method: ProviderAuthMethod }) {
  return method === "oauth" ? (
    <LogIn className="size-4" />
  ) : (
    <KeyRound className="size-4" />
  );
}

export function ProviderAuthSection({
  methods,
  providerId,
  onAuthChange,
}: {
  methods: ProviderAuthMethodRecord[];
  providerId: string;
  onAuthChange(): Promise<void>;
}) {
  const { t } = useTranslation("settings");
  const [auth, setAuth] = useState<ProviderAuthState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [prompt, setPrompt] = useState<ProviderAuthPrompt | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const loginIdRef = useRef<string | null>(null);

  async function reloadAuth() {
    const nextAuth = await desktopApi.readProviderAuth(providerId);
    setAuth(nextAuth);
  }

  useMountEffect(() => {
    void reloadAuth().catch((readError) => {
      setError(
        readError instanceof Error
          ? readError.message
          : t("providers.auth.readFailed"),
      );
    });
    return () => {
      const loginId = loginIdRef.current;
      if (loginId) {
        void desktopApi.cancelProviderAuthLogin(loginId);
      }
    };
  });

  async function handleLogin(method: ProviderAuthMethod) {
    let startedLoginId: string | null = null;
    setError(null);
    setPrompt(null);
    setPromptValue("");
    setStatus(t("providers.auth.starting"));
    setIsBusy(true);
    try {
      const { loginId } = await desktopApi.startProviderAuthLogin(
        providerId,
        method,
      );
      startedLoginId = loginId;
      loginIdRef.current = loginId;
      while (loginIdRef.current === loginId) {
        const update = await desktopApi.nextProviderAuthLogin(loginId);
        if (update.type === "info" || update.type === "progress") {
          setStatus(update.message);
          continue;
        }
        if (update.type === "auth_url") {
          setStatus(
            update.instructions ?? t("providers.auth.waitingForBrowser"),
          );
          await desktopApi.openExternal(update.url);
          continue;
        }
        if (update.type === "device_code") {
          setStatus(t("providers.auth.deviceCode", { code: update.userCode }));
          await desktopApi.openExternal(update.verificationUri);
          continue;
        }
        if (update.type === "prompt") {
          setPrompt(update.prompt);
          setPromptValue("");
          continue;
        }
        if (update.type === "prompt_cancelled") {
          setPrompt((current) =>
            current?.id === update.promptId ? null : current,
          );
          continue;
        }
        if (update.type === "error") {
          throw new Error(update.error);
        }
        setPrompt(null);
        setStatus(t("providers.auth.connected"));
        await reloadAuth();
        await onAuthChange();
        break;
      }
    } catch (loginError) {
      if (loginIdRef.current) {
        setError(
          loginError instanceof Error
            ? loginError.message
            : t("providers.auth.loginFailed"),
        );
      }
      if (startedLoginId) {
        await desktopApi
          .cancelProviderAuthLogin(startedLoginId)
          .catch(() => {});
      }
    } finally {
      loginIdRef.current = null;
      setIsBusy(false);
    }
  }

  async function handlePromptSubmit() {
    const loginId = loginIdRef.current;
    if (!loginId || !prompt || !promptValue) {
      return;
    }
    await desktopApi.respondProviderAuthLogin(loginId, prompt.id, promptValue);
    setPrompt(null);
    setPromptValue("");
  }

  async function handleCancel() {
    const loginId = loginIdRef.current;
    loginIdRef.current = null;
    setPrompt(null);
    setStatus(null);
    setIsBusy(false);
    if (loginId) {
      await desktopApi.cancelProviderAuthLogin(loginId);
    }
  }

  async function handleLogout() {
    setError(null);
    setIsBusy(true);
    try {
      await desktopApi.logoutProviderAuth(providerId);
      await reloadAuth();
      await onAuthChange();
      setStatus(null);
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : t("providers.auth.logoutFailed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <SettingsGroup title={t("providers.auth.title")}>
      {methods.map((method) => {
        const isActive = auth?.type === method.type;
        return (
          <div
            className="flex min-h-14 flex-wrap items-center justify-between gap-3 py-3"
            key={method.type}
          >
            <div className="flex min-w-0 items-center gap-3">
              <AuthMethodIcon method={method.type} />
              <div className="min-w-0">
                <Text size="body" weight="medium">
                  {method.label}
                </Text>
                <Text size="meta" tone="muted">
                  {method.type === "oauth"
                    ? t("providers.auth.accountDescription")
                    : t("providers.auth.apiKeyDescription")}
                </Text>
              </div>
            </div>
            {isActive ? (
              <div className="flex items-center gap-2">
                <Text size="meta" tone="muted">
                  {auth.source ?? t("providers.auth.connected")}
                </Text>
                <Button
                  disabled={isBusy}
                  size="sm"
                  type="button"
                  variant="ghost"
                  onClick={() => void handleLogout()}
                >
                  <LogOut className="size-4" />
                  {t("providers.auth.signOut")}
                </Button>
              </div>
            ) : (
              <Button
                disabled={isBusy}
                size="sm"
                type="button"
                variant="secondary"
                onClick={() => void handleLogin(method.type)}
              >
                {isBusy ? (
                  <Spinner size="sm" />
                ) : (
                  <AuthMethodIcon method={method.type} />
                )}
                {t("providers.auth.useMethod")}
              </Button>
            )}
          </div>
        );
      })}

      {prompt ? (
        <div className="grid gap-3 py-4">
          <Text size="body" weight="medium">
            {prompt.message}
          </Text>
          {prompt.type === "select" ? (
            <SettingsSelect
              appearance="outline"
              ariaLabel={prompt.message}
              options={prompt.options.map((option) => ({
                label: option.label,
                value: option.id,
              }))}
              value={promptValue}
              onChange={setPromptValue}
            />
          ) : (
            <Input
              placeholder={prompt.placeholder ?? undefined}
              type={prompt.type === "secret" ? "password" : "text"}
              value={promptValue}
              onChange={(event) => setPromptValue(event.target.value)}
            />
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => void handleCancel()}
            >
              <X className="size-4" />
              {t("providers.auth.cancel")}
            </Button>
            <Button
              disabled={!promptValue}
              type="button"
              variant="secondary"
              onClick={() => void handlePromptSubmit()}
            >
              <Check className="size-4" />
              {t("providers.auth.continue")}
            </Button>
          </div>
        </div>
      ) : null}

      {status || error ? (
        <div className="py-3">
          <Text size="meta" tone={error ? "destructive" : "muted"}>
            {error ?? status}
          </Text>
          {isBusy && !prompt ? (
            <Button
              className="ms-2"
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => void handleCancel()}
            >
              {t("providers.auth.cancel")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </SettingsGroup>
  );
}
