import { Braces, Check, Plus, Save, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Button,
  EmptyState,
  Spinner,
  Text,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui";
import { desktopApi, useMountEffect } from "@/lib";
import {
  configToServerForms,
  createMcpServerName,
  type McpConfig,
  type McpServerForm,
  parseMcpConfig,
  serializeServerForms,
} from "./mcp-config";
import { McpServerEditor } from "./mcp-server-editor";

type EditorMode = "form" | "json";

export function McpSettingsPanel() {
  const { t } = useTranslation("settings");
  const [mode, setMode] = useState<EditorMode>("form");
  const [config, setConfig] = useState("");
  const [baseConfig, setBaseConfig] = useState<McpConfig | null>(null);
  const [servers, setServers] = useState<McpServerForm[]>([]);
  const [configPath, setConfigPath] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useMountEffect(() => {
    void desktopApi
      .readMcpConfig()
      .then((result) => {
        const parsed = parseMcpConfig(result.content);
        setConfig(result.content);
        setBaseConfig(parsed);
        setServers(configToServerForms(parsed));
        setConfigPath(result.path);
      })
      .catch((loadError) => {
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
      })
      .finally(() => setIsLoading(false));
  });

  const updateServers = (nextServers: McpServerForm[]) => {
    setServers(nextServers);
    setIsSaved(false);
    if (!baseConfig) return;
    try {
      setConfig(serializeServerForms(baseConfig, nextServers));
      setError("");
    } catch (nextError) {
      setError(
        nextError instanceof Error ? nextError.message : String(nextError),
      );
    }
  };

  const changeMode = (nextMode: string) => {
    if (nextMode !== "form" && nextMode !== "json") return;
    if (nextMode === "form") {
      try {
        const parsed = parseMcpConfig(config);
        setBaseConfig(parsed);
        setServers(configToServerForms(parsed));
        setError("");
      } catch (parseError) {
        setError(
          parseError instanceof Error ? parseError.message : String(parseError),
        );
        return;
      }
    } else if (baseConfig) {
      try {
        setConfig(serializeServerForms(baseConfig, servers));
        setError("");
      } catch (serializeError) {
        setError(
          serializeError instanceof Error
            ? serializeError.message
            : String(serializeError),
        );
        return;
      }
    }
    setMode(nextMode);
  };

  const addServer = () => {
    const name = createMcpServerName(servers);
    updateServers([
      ...servers,
      {
        args: "-y\n",
        env: "",
        id: name,
        name,
        raw: { lifecycle: "lazy" },
        target: "npx",
        transport: "stdio",
      },
    ]);
  };

  const save = async () => {
    if (error) return;
    setIsSaving(true);
    setIsSaved(false);
    try {
      const result = await desktopApi.saveMcpConfig(config);
      const parsed = parseMcpConfig(result.content);
      setConfig(result.content);
      setBaseConfig(parsed);
      setServers(configToServerForms(parsed));
      setConfigPath(result.path);
      setIsSaved(true);
      toast.success(t("mcp.saved"));
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : String(saveError),
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="settings-panel-enter flex min-h-40 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  let saveIcon = <Save className="size-4" />;
  if (isSaving) saveIcon = <Spinner size="sm" />;
  else if (isSaved) saveIcon = <Check className="size-4" />;

  return (
    <div className="settings-panel-enter flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <Text className="max-w-xl text-muted-foreground" size="body">
          {t("mcp.description")}
        </Text>
        <ToggleGroup
          aria-label={t("mcp.mode.label")}
          className="w-fit shrink-0"
          spacing={0.5}
          type="single"
          value={mode}
          variant="segmented"
          onValueChange={changeMode}
        >
          <ToggleGroupItem aria-label={t("mcp.mode.form")} value="form">
            <SlidersHorizontal className="size-3.5" />
            {t("mcp.mode.form")}
          </ToggleGroupItem>
          <ToggleGroupItem aria-label={t("mcp.mode.json")} value="json">
            <Braces className="size-3.5" />
            {t("mcp.mode.json")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex flex-col">
        {mode === "form" ? (
          <div className="rounded-card border border-border/40 bg-card/45 shadow-sm">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="text-body font-medium text-foreground">
                {t("mcp.form.servers")}
              </div>
              <Button
                size="sm"
                type="button"
                variant="ghost"
                onClick={addServer}
              >
                <Plus className="size-4" />
                {t("mcp.form.add")}
              </Button>
            </div>
            <div className="flex flex-col divide-y divide-border/30 border-t border-border/30">
              {servers.length ? (
                servers.map((server, index) => (
                  <McpServerEditor
                    index={index}
                    key={server.id}
                    server={server}
                    onChange={(nextServer) =>
                      updateServers(
                        servers.map((item, itemIndex) =>
                          itemIndex === index ? nextServer : item,
                        ),
                      )
                    }
                    onRemove={() =>
                      updateServers(
                        servers.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  />
                ))
              ) : (
                <EmptyState
                  description={t("mcp.form.emptyDescription")}
                  title={t("mcp.form.emptyTitle")}
                />
              )}
            </div>
          </div>
        ) : (
          <Textarea
            aria-invalid={Boolean(error)}
            aria-label={t("mcp.editorLabel")}
            className="min-h-96 resize-y rounded-card border-border/40 bg-card/45 font-mono text-body leading-6 shadow-sm focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20"
            spellCheck={false}
            value={config}
            onChange={(event) => {
              setConfig(event.target.value);
              setError("");
              setIsSaved(false);
            }}
          />
        )}
      </div>

      {error ? (
        <Text className="text-destructive" role="alert" size="meta">
          {error}
        </Text>
      ) : null}

      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          {configPath ? (
            <Text
              className="block truncate text-muted-foreground"
              size="meta"
              title={configPath}
            >
              {configPath}
            </Text>
          ) : null}
          <Text className="mt-1 block text-muted-foreground" size="meta">
            {t("mcp.restartHint")}
          </Text>
        </div>
        <Button
          className="shrink-0"
          disabled={isSaving || Boolean(error)}
          size="sm"
          type="button"
          variant="secondary"
          onClick={() => void save()}
        >
          {saveIcon}
          {isSaving ? t("mcp.saving") : t("mcp.save")}
        </Button>
      </div>
    </div>
  );
}
