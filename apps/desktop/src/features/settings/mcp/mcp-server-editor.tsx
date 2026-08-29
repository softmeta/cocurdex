import { Trash2 } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Input,
  Text,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui";
import { cn } from "@/lib";
import type { McpServerForm } from "./mcp-config";

function McpInput({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <Input
      className={cn(
        "h-8 min-w-0 rounded-control border-border/70 bg-background/60 text-body shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20",
        className,
      )}
      {...props}
    />
  );
}

function McpTextarea({ className, ...props }: ComponentProps<typeof Textarea>) {
  return (
    <Textarea
      className={cn(
        "min-h-20 resize-y rounded-control border-border/70 bg-background/60 font-mono text-body shadow-none focus-visible:border-ring/60 focus-visible:ring-2 focus-visible:ring-ring/20",
        className,
      )}
      {...props}
    />
  );
}

function McpLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label
      className="text-meta font-medium text-muted-foreground"
      htmlFor={htmlFor}
    >
      {children}
    </label>
  );
}

function applyTransport(
  server: McpServerForm,
  transport: McpServerForm["transport"],
): McpServerForm {
  if (transport === server.transport) return server;
  if (transport === "http") {
    return {
      ...server,
      target: server.target.trim() === "npx" ? "" : server.target,
      transport,
    };
  }
  return {
    ...server,
    target: /^https?:\/\//i.test(server.target.trim()) ? "npx" : server.target,
    transport,
  };
}

export function McpServerEditor({
  index,
  server,
  onChange,
  onRemove,
}: {
  index: number;
  server: McpServerForm;
  onChange(server: McpServerForm): void;
  onRemove(): void;
}) {
  const { t } = useTranslation("settings");
  const id = `mcp-server-${index}`;
  const isStdio = server.transport === "stdio";

  return (
    <div className="flex flex-col gap-3 px-4 py-3.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <McpInput
            aria-label={t("mcp.form.name")}
            id={`${id}-name`}
            placeholder={t("mcp.form.namePlaceholder")}
            value={server.name}
            onChange={(event) =>
              onChange({ ...server, name: event.target.value })
            }
          />
        </div>
        <ToggleGroup
          aria-label={t("mcp.form.transport")}
          className="w-fit shrink-0"
          spacing={0.5}
          type="single"
          value={server.transport}
          variant="segmented"
          onValueChange={(transport) => {
            if (transport === "http" || transport === "stdio") {
              onChange(applyTransport(server, transport));
            }
          }}
        >
          <ToggleGroupItem value="stdio">{t("mcp.form.local")}</ToggleGroupItem>
          <ToggleGroupItem value="http">{t("mcp.form.remote")}</ToggleGroupItem>
        </ToggleGroup>
        <Button
          aria-label={t("mcp.form.remove")}
          className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
          size="icon"
          variant="ghost"
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      <div className="grid gap-1.5">
        <McpLabel htmlFor={`${id}-target`}>
          {isStdio ? t("mcp.form.command") : t("mcp.form.url")}
        </McpLabel>
        <McpInput
          id={`${id}-target`}
          placeholder={
            isStdio
              ? t("mcp.form.commandPlaceholder")
              : t("mcp.form.urlPlaceholder")
          }
          value={server.target}
          onChange={(event) =>
            onChange({ ...server, target: event.target.value })
          }
        />
      </div>

      {isStdio ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1.5">
            <McpLabel htmlFor={`${id}-args`}>
              {t("mcp.form.arguments")}
            </McpLabel>
            <McpTextarea
              id={`${id}-args`}
              placeholder={t("mcp.form.argumentsPlaceholder")}
              spellCheck={false}
              value={server.args}
              onChange={(event) =>
                onChange({ ...server, args: event.target.value })
              }
            />
            <Text className="text-muted-foreground" size="meta">
              {t("mcp.form.argumentsDescription")}
            </Text>
          </div>
          <div className="grid gap-1.5">
            <McpLabel htmlFor={`${id}-env`}>
              {t("mcp.form.environment")}
            </McpLabel>
            <McpTextarea
              id={`${id}-env`}
              placeholder={t("mcp.form.environmentPlaceholder")}
              spellCheck={false}
              value={server.env}
              onChange={(event) =>
                onChange({ ...server, env: event.target.value })
              }
            />
            <Text className="text-muted-foreground" size="meta">
              {t("mcp.form.environmentDescription")}
            </Text>
          </div>
        </div>
      ) : null}
    </div>
  );
}
