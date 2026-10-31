import {
  type McpConfigFile,
  type McpServerConfig,
  type McpServerScope,
  type McpServerStatus,
  sameMcpServerConfig,
} from "@cocurdex/shared";
import { Check, PlugZap } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppRemoveButton, SettingsGroup } from "@/components";
import {
  Button,
  Label,
  Spinner,
  Switch,
  Text,
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui";
import { desktopApi } from "@/lib";
import { McpAdvancedSection } from "./mcp-advanced-section";
import { McpAuthSection } from "./mcp-auth-section";
import { McpField, McpInput, McpKeyValueEditor } from "./mcp-fields";
import {
  type McpServerForm,
  serverConfigToForm,
  serverFormToConfig,
  validateServerForm,
} from "./mcp-server-form";
import { McpStatusDot } from "./mcp-status-dot";

export type McpDetailScope = McpServerScope | "new";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function McpServerDetail({
  config,
  name,
  otherNames,
  scope,
  sourcePath,
  status,
  workspaceId,
  onEnabledSaved,
  onRemoved,
  onSaved,
  onSignInChanged,
  onTested,
}: {
  config: McpServerConfig;
  name: string;
  otherNames: string[];
  scope: McpDetailScope;
  sourcePath: string;
  status: McpServerStatus | undefined;
  workspaceId?: string;
  onEnabledSaved(file: McpConfigFile): void;
  onRemoved(file: McpConfigFile): void;
  onSaved(file: McpConfigFile, name: string): void;
  onSignInChanged(name: string): void;
  onTested(status: McpServerStatus): void;
}) {
  const { t } = useTranslation("settings");
  const enabledId = useId();
  const [form, setForm] = useState(() => serverConfigToForm(name, config));
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const readOnly = scope === "project";
  const isNew = scope === "new";
  const draftConfig = serverFormToConfig(form, config);
  const isDirty =
    isNew ||
    form.name.trim() !== name ||
    !sameMcpServerConfig(draftConfig, config);

  const update = (patch: Partial<McpServerForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setError("");
  };

  const changeEnabled = async (enabled: boolean) => {
    update({ enabled });
    if (isNew) return;
    try {
      onEnabledSaved(await desktopApi.setMcpServerEnabled(name, enabled));
    } catch (enableError) {
      update({ enabled: !enabled });
      setError(errorMessage(enableError));
    }
  };

  const save = async () => {
    const formError = validateServerForm(form, otherNames);
    if (formError) {
      setError(t(`mcp.errors.${formError}`));
      return;
    }
    setIsSaving(true);
    try {
      const nextName = form.name.trim();
      const file = await desktopApi.saveMcpServer(
        nextName,
        draftConfig,
        isNew ? undefined : name,
      );
      onSaved(file, nextName);
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const test = async () => {
    setIsTesting(true);
    setError("");
    try {
      const result = await desktopApi.testMcpServer(
        form.name.trim() || name,
        draftConfig,
        workspaceId,
      );
      onTested({ ...result, scope: readOnly ? "project" : "global" });
    } catch (testError) {
      setError(errorMessage(testError));
    } finally {
      setIsTesting(false);
    }
  };

  const remove = async () => {
    try {
      onRemoved(await desktopApi.removeMcpServer(name));
    } catch (removeError) {
      setError(errorMessage(removeError));
    }
  };

  const dotState = form.enabled ? (status?.state ?? "unknown") : "disabled";

  return (
    <section aria-label={t("mcp.detail.label")} data-mcp-detail={name}>
      <SettingsGroup>
        <div className="grid gap-4 py-4">
          <div className="flex min-h-8 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <McpStatusDot state={dotState} />
              <Text size="body" weight="semibold">
                {isNew ? t("mcp.detail.newTitle") : name}
              </Text>
              {status && !isNew ? (
                <Text size="meta" tone="muted">
                  {t(`mcp.state.${dotState}`)}
                </Text>
              ) : null}
            </div>
            <Label
              className="flex shrink-0 items-center gap-2"
              htmlFor={enabledId}
            >
              <Text size="body">{t("mcp.detail.enabled")}</Text>
              <Switch
                checked={form.enabled}
                disabled={readOnly}
                id={enabledId}
                onCheckedChange={(enabled) => void changeEnabled(enabled)}
              />
            </Label>
          </div>
          {readOnly ? (
            <Text size="meta" tone="muted">
              {t("mcp.detail.projectReadOnly", { path: sourcePath })}
            </Text>
          ) : null}

          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <McpField label={t("mcp.fields.name")}>
              <McpInput
                className="font-mono"
                disabled={readOnly}
                placeholder="github"
                spellCheck={false}
                value={form.name}
                onChange={(event) => update({ name: event.target.value })}
              />
            </McpField>
            <ToggleGroup
              aria-label={t("mcp.fields.transport")}
              disabled={readOnly}
              spacing={0.5}
              type="single"
              value={form.transport}
              variant="segmented"
              onValueChange={(value) => {
                if (value === "stdio" || value === "http") {
                  update({ transport: value });
                }
              }}
            >
              <ToggleGroupItem value="stdio">
                {t("mcp.fields.local")}
              </ToggleGroupItem>
              <ToggleGroupItem value="http">
                {t("mcp.fields.remote")}
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {form.transport === "stdio" ? (
            <>
              <div className="grid gap-3 md:grid-cols-[2fr_3fr]">
                <McpField label={t("mcp.fields.command")}>
                  <McpInput
                    className="font-mono"
                    disabled={readOnly}
                    placeholder="npx"
                    spellCheck={false}
                    value={form.command}
                    onChange={(event) =>
                      update({ command: event.target.value })
                    }
                  />
                </McpField>
                <McpField label={t("mcp.fields.args")}>
                  <McpInput
                    className="font-mono"
                    disabled={readOnly}
                    placeholder="-y @modelcontextprotocol/server-github"
                    spellCheck={false}
                    value={form.args}
                    onChange={(event) => update({ args: event.target.value })}
                  />
                </McpField>
              </div>
              <McpKeyValueEditor
                addLabel={t("mcp.fields.addEnv")}
                disabled={readOnly}
                keyPlaceholder="GITHUB_TOKEN"
                label={t("mcp.fields.env")}
                rows={form.env}
                valuePlaceholder="${GITHUB_TOKEN}"
                onChange={(env) => update({ env })}
              />
            </>
          ) : (
            <>
              <McpField label={t("mcp.fields.url")}>
                <McpInput
                  className="font-mono"
                  disabled={readOnly}
                  placeholder="https://example.com/mcp"
                  spellCheck={false}
                  value={form.url}
                  onChange={(event) => update({ url: event.target.value })}
                />
              </McpField>
              <McpKeyValueEditor
                addLabel={t("mcp.fields.addHeader")}
                disabled={readOnly}
                keyPlaceholder="X-Api-Key"
                label={t("mcp.fields.headers")}
                rows={form.headers}
                valuePlaceholder="${API_KEY}"
                onChange={(headers) => update({ headers })}
              />
            </>
          )}
        </div>

        {form.transport === "http" ? (
          <McpAuthSection
            authMode={form.authMode}
            bearerToken={form.bearerToken}
            canSignIn={!isNew && !isDirty}
            name={name}
            readOnly={readOnly}
            status={status}
            workspaceId={workspaceId}
            onAuthModeChange={(authMode) => update({ authMode })}
            onBearerTokenChange={(bearerToken) => update({ bearerToken })}
            onSignInChanged={() => onSignInChanged(name)}
          />
        ) : null}

        <McpAdvancedSection form={form} readOnly={readOnly} onChange={update} />

        {isNew || readOnly ? null : (
          <div className="flex flex-col items-start gap-1.5 pt-4">
            <Label>{t("mcp.detail.manageLabel")}</Label>
            <AppRemoveButton
              cancelLabel={t("mcp.removeConfirm.cancel")}
              confirmDescription={t("mcp.removeConfirm.description", {
                name,
              })}
              confirmLabel={t("mcp.removeConfirm.confirm")}
              confirmTitle={t("mcp.removeConfirm.title")}
              label={t("mcp.actions.remove")}
              onConfirm={() => void remove()}
            />
          </div>
        )}

        <div className="grid gap-3 py-4">
          {error ? (
            <Text role="alert" size="meta" tone="destructive">
              {error}
            </Text>
          ) : null}
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="flex items-center gap-2">
              <Button
                disabled={isTesting}
                size="sm"
                type="button"
                variant="outline"
                onClick={() => void test()}
              >
                {isTesting ? (
                  <Spinner size="sm" />
                ) : (
                  <PlugZap className="size-4" />
                )}
                {isTesting ? t("mcp.actions.testing") : t("mcp.actions.test")}
              </Button>
              {readOnly ? null : (
                <Button
                  disabled={isSaving || !isDirty}
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => void save()}
                >
                  {isSaving ? (
                    <Spinner size="sm" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  {t("mcp.actions.save")}
                </Button>
              )}
            </div>
          </div>
        </div>
      </SettingsGroup>
    </section>
  );
}
