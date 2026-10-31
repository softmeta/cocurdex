import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Text,
} from "@/components/ui";
import { cn } from "@/lib";
import { SettingsSelect } from "../settings-select";
import { McpField, McpInput } from "./mcp-fields";
import { MCP_EXPOSURES, type McpServerForm } from "./mcp-server-form";

export function McpAdvancedSection({
  form,
  readOnly,
  onChange,
}: {
  form: McpServerForm;
  readOnly: boolean;
  onChange(patch: Partial<McpServerForm>): void;
}) {
  const { t } = useTranslation("settings");
  const [open, setOpen] = useState(false);

  return (
    <Collapsible className="py-2" open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger
        className="flex h-8 w-full items-center gap-1.5 text-start text-muted-foreground hover:text-foreground"
        type="button"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 transition-transform",
            open && "rotate-90",
          )}
        />
        <Text size="meta" weight="medium">
          {t("mcp.advanced.title")}
        </Text>
      </CollapsibleTrigger>
      <CollapsibleContent className="grid gap-4 pt-2 pb-2">
        <div className="flex min-h-8 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text size="body" weight="medium">
              {t("mcp.advanced.exposure")}
            </Text>
            <Text size="meta" tone="muted">
              {t(`mcp.advanced.exposureHint.${form.exposure}`)}
            </Text>
          </div>
          <SettingsSelect
            ariaLabel={t("mcp.advanced.exposure")}
            disabled={readOnly}
            options={MCP_EXPOSURES.map((exposure) => ({
              value: exposure,
              label: t(`mcp.advanced.exposureOption.${exposure}`),
            }))}
            value={form.exposure}
            onChange={(value) => {
              const exposure = MCP_EXPOSURES.find((item) => item === value);
              if (exposure) onChange({ exposure });
            }}
          />
        </div>
        {form.transport === "http" ? (
          <div className="grid gap-3">
            <Text size="meta" tone="muted">
              {t("mcp.advanced.oauthClientHint")}
            </Text>
            <div className="grid gap-3 md:grid-cols-2">
              <McpField label={t("mcp.advanced.clientId")}>
                <McpInput
                  className="font-mono"
                  disabled={readOnly}
                  spellCheck={false}
                  value={form.oauthClientId}
                  onChange={(event) =>
                    onChange({ oauthClientId: event.target.value })
                  }
                />
              </McpField>
              <McpField label={t("mcp.advanced.clientSecret")}>
                <McpInput
                  autoComplete="off"
                  className="font-mono"
                  disabled={readOnly}
                  type="password"
                  value={form.oauthClientSecret}
                  onChange={(event) =>
                    onChange({ oauthClientSecret: event.target.value })
                  }
                />
              </McpField>
            </div>
            <McpField label={t("mcp.advanced.callbackPort")}>
              <McpInput
                className="w-32 font-mono"
                disabled={readOnly}
                inputMode="numeric"
                value={form.oauthCallbackPort}
                onChange={(event) =>
                  onChange({ oauthCallbackPort: event.target.value })
                }
              />
            </McpField>
          </div>
        ) : null}
      </CollapsibleContent>
    </Collapsible>
  );
}
