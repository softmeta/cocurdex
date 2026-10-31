import type { McpServerStatus } from "@cocurdex/shared";
import { LogIn, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Spinner,
  Text,
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui";
import { McpField, McpInput } from "./mcp-fields";
import type { McpAuthMode } from "./mcp-server-form";
import { useMcpLogin } from "./use-mcp-login";

function McpOAuthStatus({
  canSignIn,
  name,
  status,
  workspaceId,
  onChanged,
}: {
  canSignIn: boolean;
  name: string;
  status: McpServerStatus | undefined;
  workspaceId?: string;
  onChanged(): void;
}) {
  const { t } = useTranslation("settings");
  const login = useMcpLogin({ name, workspaceId, onSignedIn: onChanged });
  const signedIn = status?.signedIn === true;

  let description: string = t("mcp.auth.oauthHint");
  if (!canSignIn) description = t("mcp.auth.saveFirst");
  else if (signedIn) description = t("mcp.auth.signedIn");
  else if (status?.state === "needs-auth") {
    description = t("mcp.auth.needsSignIn");
  }

  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <Text size="meta" tone="muted">
          {login.state.phase === "waiting"
            ? t("mcp.auth.waiting")
            : description}
        </Text>
        {login.state.phase === "failed" ? (
          <Text role="alert" size="meta" tone="destructive">
            {login.state.error || t("mcp.auth.failed")}
          </Text>
        ) : null}
      </div>
      {login.state.phase === "waiting" ? (
        <Button size="sm" type="button" variant="ghost" onClick={login.cancel}>
          {t("mcp.auth.cancel")}
        </Button>
      ) : null}
      {login.state.phase !== "waiting" && signedIn ? (
        <Button
          size="sm"
          type="button"
          variant="ghost"
          onClick={() => void login.signOut()}
        >
          <LogOut className="size-3.5" />
          {t("mcp.auth.signOut")}
        </Button>
      ) : null}
      {login.state.phase !== "waiting" && !signedIn ? (
        <Button
          disabled={!canSignIn || login.state.phase === "starting"}
          size="sm"
          type="button"
          variant="outline"
          onClick={() => void login.start()}
        >
          {login.state.phase === "starting" ? (
            <Spinner size="sm" />
          ) : (
            <LogIn className="size-3.5" />
          )}
          {t("mcp.auth.signIn")}
        </Button>
      ) : null}
    </div>
  );
}

export function McpAuthSection({
  authMode,
  bearerToken,
  canSignIn,
  name,
  readOnly,
  status,
  workspaceId,
  onAuthModeChange,
  onBearerTokenChange,
  onSignInChanged,
}: {
  authMode: McpAuthMode;
  bearerToken: string;
  canSignIn: boolean;
  name: string;
  readOnly: boolean;
  status: McpServerStatus | undefined;
  workspaceId?: string;
  onAuthModeChange(mode: McpAuthMode): void;
  onBearerTokenChange(token: string): void;
  onSignInChanged(): void;
}) {
  const { t } = useTranslation("settings");
  return (
    <div className="grid gap-3 py-4">
      <div className="flex min-h-8 items-center justify-between gap-3">
        <Text size="body" weight="semibold">
          {t("mcp.auth.title")}
        </Text>
        <ToggleGroup
          aria-label={t("mcp.auth.title")}
          disabled={readOnly}
          spacing={0.5}
          type="single"
          value={authMode}
          variant="segmented"
          onValueChange={(value) => {
            if (value === "oauth" || value === "bearer") {
              onAuthModeChange(value);
            }
          }}
        >
          <ToggleGroupItem value="oauth">{t("mcp.auth.oauth")}</ToggleGroupItem>
          <ToggleGroupItem value="bearer">
            {t("mcp.auth.bearer")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      {authMode === "bearer" ? (
        <McpField hint={t("mcp.auth.bearerHint")} label={t("mcp.auth.token")}>
          <McpInput
            autoComplete="off"
            className="font-mono"
            disabled={readOnly}
            spellCheck={false}
            type="password"
            value={bearerToken}
            onChange={(event) => onBearerTokenChange(event.target.value)}
          />
        </McpField>
      ) : (
        <McpOAuthStatus
          canSignIn={canSignIn}
          key={name}
          name={name}
          status={status}
          workspaceId={workspaceId}
          onChanged={onSignInChanged}
        />
      )}
    </div>
  );
}
