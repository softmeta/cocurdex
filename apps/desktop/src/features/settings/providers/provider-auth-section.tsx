import type {
  ProviderAuthMethod,
  ProviderAuthMethodRecord,
  ProviderAuthPrompt,
  ProviderAuthState,
} from "@cocurdex/shared";
import {
  Copy,
  ExternalLink,
  KeyRound,
  LogIn,
  LogOut,
  Plus,
} from "lucide-react";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Input, Spinner, Text } from "@/components/ui";
import { cn, desktopApi, useMountEffect } from "@/lib";
import { SettingsSelect } from "../settings-select";
import { providerAuthSourceLabel } from "./auth-source-label";
import { SettingsGroup } from "./settings-group";

function AuthMethodIcon({ method }: { method: ProviderAuthMethod }) {
  return method === "oauth" ? (
    <LogIn className="size-4" />
  ) : (
    <KeyRound className="size-4" />
  );
}

export function ProviderAuthSection({
  isDraft,
  methods,
  providerId,
  onAuthChange,
}: {
  isDraft: boolean;
  methods: ProviderAuthMethodRecord[];
  providerId: string;
  onAuthChange(): Promise<void>;
}) {
  const { t } = useTranslation("settings");
  const [auth, setAuth] = useState<ProviderAuthState | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [prompt, setPrompt] = useState<ProviderAuthPrompt | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const [deviceCode, setDeviceCode] = useState<{
    userCode: string;
    verificationUri: string;
  } | null>(null);
  const loginIdRef = useRef<string | null>(null);

  async function reloadAuth() {
    const nextAuth = await desktopApi.readProviderAuth(providerId);
    setAuth(nextAuth);
  }

  useMountEffect(() => {
    void reloadAuth().catch((readError) => {
      toast.error(
        readError instanceof Error
          ? readError.message
          : t("providers.auth.readFailed"),
      );
    });
    return () => {
      const loginId = loginIdRef.current;
      if (loginId) {
        toast.dismiss(loginId);
        void desktopApi.cancelProviderAuthLogin(loginId);
      }
    };
  });

  async function handleLogin(method: ProviderAuthMethod) {
    let startedLoginId: string | null = null;
    setPrompt(null);
    setPromptValue("");
    setDeviceCode(null);
    setIsBusy(true);
    try {
      const { loginId } = await desktopApi.startProviderAuthLogin(
        providerId,
        method,
      );
      startedLoginId = loginId;
      loginIdRef.current = loginId;
      const showProgress = (message: string) =>
        toast.loading(message, { id: loginId });
      showProgress(t("providers.auth.starting"));
      while (loginIdRef.current === loginId) {
        const update = await desktopApi.nextProviderAuthLogin(loginId);
        if (update.type === "info" || update.type === "progress") {
          showProgress(update.message);
          continue;
        }
        if (update.type === "auth_url") {
          showProgress(
            update.instructions ?? t("providers.auth.waitingForBrowser"),
          );
          await desktopApi.openExternal(update.url);
          continue;
        }
        if (update.type === "device_code") {
          toast.dismiss(loginId);
          setDeviceCode({
            userCode: update.userCode,
            verificationUri: update.verificationUri,
          });
          await desktopApi.openExternal(update.verificationUri);
          continue;
        }
        if (update.type === "prompt") {
          toast.dismiss(loginId);
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
        toast.success(t("providers.auth.connected"), { id: loginId });
        await reloadAuth();
        await onAuthChange();
        break;
      }
    } catch (loginError) {
      if (!startedLoginId || loginIdRef.current) {
        toast.error(
          loginError instanceof Error
            ? loginError.message
            : t("providers.auth.loginFailed"),
          { id: startedLoginId ?? undefined },
        );
      }
      if (startedLoginId) {
        await desktopApi
          .cancelProviderAuthLogin(startedLoginId)
          .catch(() => {});
      }
    } finally {
      loginIdRef.current = null;
      setDeviceCode(null);
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
    setDeviceCode(null);
    setIsBusy(false);
    if (loginId) {
      toast.dismiss(loginId);
      await desktopApi.cancelProviderAuthLogin(loginId);
    }
  }

  async function handleCopyDeviceCode(code: string) {
    await navigator.clipboard.writeText(code);
    toast.success(t("providers.auth.codeCopied"));
  }

  async function handleAddProvider() {
    setIsBusy(true);
    try {
      await onAuthChange();
    } finally {
      setIsBusy(false);
    }
  }

  async function handleLogout() {
    setIsBusy(true);
    try {
      await desktopApi.logoutProviderAuth(providerId);
      await reloadAuth();
      await onAuthChange();
    } catch (logoutError) {
      toast.error(
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
              <div className="grid min-w-0 gap-0.5">
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
                  {providerAuthSourceLabel(t, auth)}
                </Text>
                {isDraft ? (
                  <Button
                    disabled={isBusy}
                    size="sm"
                    type="button"
                    variant="secondary"
                    onClick={() => void handleAddProvider()}
                  >
                    {isBusy ? (
                      <Spinner size="sm" />
                    ) : (
                      <Plus className="size-4" />
                    )}
                    {t("providers.auth.addProvider")}
                  </Button>
                ) : (
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
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {isBusy && !prompt ? (
                  <Button
                    size="sm"
                    type="button"
                    variant="ghost"
                    onClick={() => void handleCancel()}
                  >
                    {t("providers.auth.cancel")}
                  </Button>
                ) : null}
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
                  {method.type === "oauth"
                    ? t("providers.auth.signIn")
                    : t("providers.auth.setApiKey")}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {prompt ? (
        <form
          className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            void handlePromptSubmit();
          }}
        >
          <Text size="meta" tone="muted">
            {prompt.message}
          </Text>
          <div
            className={cn(
              "flex items-center gap-2",
              prompt.type !== "select" && "basis-full",
            )}
          >
            {prompt.type === "select" ? (
              <SettingsSelect
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
                autoFocus
                className="h-8 flex-1"
                placeholder={prompt.placeholder ?? undefined}
                type={prompt.type === "secret" ? "password" : "text"}
                value={promptValue}
                onChange={(event) => setPromptValue(event.target.value)}
              />
            )}
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() => void handleCancel()}
            >
              {t("providers.auth.cancel")}
            </Button>
            <Button disabled={!promptValue} size="sm" type="submit">
              {t("providers.auth.continue")}
            </Button>
          </div>
        </form>
      ) : null}
      {deviceCode ? (
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
          <div className="grid gap-1">
            <Text size="meta" tone="muted">
              {t("providers.auth.deviceCodeHint")}
            </Text>
            <Text
              as="code"
              className="select-all font-mono tracking-widest"
              size="display"
              weight="semibold"
            >
              {deviceCode.userCode}
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              type="button"
              variant="ghost"
              onClick={() =>
                void desktopApi.openExternal(deviceCode.verificationUri)
              }
            >
              <ExternalLink className="size-4" />
              {t("providers.auth.openBrowser")}
            </Button>
            <Button
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => void handleCopyDeviceCode(deviceCode.userCode)}
            >
              <Copy className="size-4" />
              {t("providers.auth.copyCode")}
            </Button>
          </div>
        </div>
      ) : null}
    </SettingsGroup>
  );
}
