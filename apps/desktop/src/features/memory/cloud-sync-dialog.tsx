import type { MemoryCloudMode } from "@cocurdex/shared";
import { Eye, EyeOff } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppCopyButton } from "@/components/app";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  IconButton,
  Input,
  Spinner,
  Text,
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui";
import { desktopApi } from "@/lib";
import { revalidateMemory } from "./memory-queries";

const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 8;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function AccountFields({
  disabled,
  idPrefix,
  mode,
  password,
  recoveryKey,
  user,
  onPasswordChange,
  onRecoveryKeyChange,
  onUserChange,
}: {
  disabled: boolean;
  idPrefix: string;
  mode: MemoryCloudMode;
  password: string;
  recoveryKey: string;
  user: string;
  onPasswordChange(value: string): void;
  onRecoveryKeyChange(value: string): void;
  onUserChange(value: string): void;
}) {
  const { t } = useTranslation("memory");
  const [revealed, setRevealed] = useState(false);
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-user`}>
          {t("cloud.username")}
        </FieldLabel>
        <Input
          autoComplete="username"
          autoFocus
          disabled={disabled}
          id={`${idPrefix}-user`}
          maxLength={64}
          placeholder={t("cloud.usernamePlaceholder")}
          spellCheck={false}
          value={user}
          onChange={(event) => onUserChange(event.target.value)}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-password`}>
          {t("cloud.password")}
        </FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            autoComplete={
              mode === "register" ? "new-password" : "current-password"
            }
            className="min-w-0 flex-1"
            disabled={disabled}
            id={`${idPrefix}-password`}
            maxLength={256}
            placeholder={t("cloud.passwordPlaceholder")}
            spellCheck={false}
            type={revealed ? "text" : "password"}
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
          />
          <IconButton
            aria-label={
              revealed ? t("cloud.hidePassword") : t("cloud.showPassword")
            }
            disabled={disabled}
            size="sm"
            onClick={() => setRevealed((current) => !current)}
          >
            {revealed ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </IconButton>
        </div>
        <FieldDescription>{t("cloud.passwordHint")}</FieldDescription>
      </Field>
      {mode === "signin" ? (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-recovery`}>
            {t("cloud.recoveryKey")}
          </FieldLabel>
          <Input
            autoComplete="off"
            className="font-mono"
            disabled={disabled}
            id={`${idPrefix}-recovery`}
            maxLength={512}
            placeholder={t("cloud.recoveryKeyPlaceholder")}
            spellCheck={false}
            value={recoveryKey}
            onChange={(event) => onRecoveryKeyChange(event.target.value)}
          />
          <FieldDescription>{t("cloud.recoveryKeyHint")}</FieldDescription>
        </Field>
      ) : (
        <FieldDescription>{t("cloud.createHint")}</FieldDescription>
      )}
    </FieldGroup>
  );
}

export function CloudSyncDialog({
  initialUser,
  onClose,
}: {
  initialUser?: string | null;
  onClose(): void;
}) {
  const { t } = useTranslation("memory");
  const idPrefix = useId();
  const [mode, setMode] = useState<MemoryCloudMode>(
    initialUser ? "signin" : "register",
  );
  const [user, setUser] = useState(initialUser ?? "");
  const [password, setPassword] = useState("");
  const [recoveryKey, setRecoveryKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issuedKey, setIssuedKey] = useState<string | null>(null);

  const canSubmit =
    user.trim().length >= MIN_USERNAME_LENGTH &&
    password.length >= MIN_PASSWORD_LENGTH &&
    (mode === "register" || recoveryKey.trim().length > 0);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await desktopApi.connectMemoryCloud({
        mode,
        user: user.trim(),
        password,
        recoveryKey: mode === "signin" ? recoveryKey.trim() : null,
      });
      await revalidateMemory();
      if (result.recoveryKey) {
        setIssuedKey(result.recoveryKey);
        return;
      }
      toast.success(t("cloud.connected"));
      onClose();
    } catch (failure) {
      const message = errorMessage(failure);
      if (mode === "register" && /already registered/i.test(message)) {
        setMode("signin");
        setError(t("cloud.alreadyRegistered"));
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  };

  if (issuedKey) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent size="compact">
          <DialogHeader>
            <DialogTitle>{t("cloud.recoveryTitle")}</DialogTitle>
            <DialogDescription>
              {t("cloud.recoveryDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="flex min-w-0 items-center gap-2">
            <Text className="min-w-0 flex-1 font-mono" size="body" truncate>
              {issuedKey}
            </Text>
            <AppCopyButton
              label={t("cloud.copyRecoveryKey")}
              value={issuedKey}
            />
          </div>
          <Text size="meta" tone="muted">
            {t("cloud.recoveryWarning")}
          </Text>
          <DialogFooter>
            <Button type="button" onClick={onClose}>
              {t("cloud.done")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent size="compact">
        <form className="contents" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>{t("cloud.title")}</DialogTitle>
            <DialogDescription>{t("cloud.description")}</DialogDescription>
          </DialogHeader>
          <ToggleGroup
            aria-label={t("cloud.mode")}
            disabled={busy}
            spacing={0.5}
            type="single"
            value={mode}
            variant="segmented"
            onValueChange={(value) => {
              if (value !== "register" && value !== "signin") return;
              setMode(value);
              setError("");
            }}
          >
            <ToggleGroupItem value="register">
              {t("cloud.modeRegister")}
            </ToggleGroupItem>
            <ToggleGroupItem value="signin">
              {t("cloud.modeSignIn")}
            </ToggleGroupItem>
          </ToggleGroup>
          <AccountFields
            disabled={busy}
            idPrefix={idPrefix}
            mode={mode}
            password={password}
            recoveryKey={recoveryKey}
            user={user}
            onPasswordChange={setPassword}
            onRecoveryKeyChange={setRecoveryKey}
            onUserChange={setUser}
          />
          {error ? (
            <Text
              className="whitespace-pre-wrap"
              role="alert"
              size="meta"
              tone="destructive"
            >
              {error}
            </Text>
          ) : null}
          <DialogFooter>
            <Button
              disabled={busy}
              type="button"
              variant="outline"
              onClick={onClose}
            >
              {t("cloud.cancel")}
            </Button>
            <Button disabled={!canSubmit || busy} type="submit">
              {busy ? <Spinner size="sm" /> : null}
              {mode === "register"
                ? t("cloud.submitCreate")
                : t("cloud.submitSignIn")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
