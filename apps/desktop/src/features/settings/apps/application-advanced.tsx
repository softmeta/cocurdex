import {
  APPLICATION_CATALOG,
  type ApplicationConnection,
} from "@cocurdex/shared";
import { ArrowUpRight, ChevronRight, LogOut } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppRemoveButton, SettingRow, SettingsGroup } from "@/components";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Label,
  Switch,
} from "@/components/ui";
import { cn, desktopApi, requestDaemon } from "@/lib";
import { ApplicationTools } from "./application-tools";
import type { ApplicationChanges } from "./use-application-save";

export function ApplicationAdvanced({
  connection,
  disabled,
  run,
  save,
  view,
  onRemoved,
}: {
  connection: ApplicationConnection;
  disabled: boolean;
  run(action: () => Promise<unknown>): Promise<void>;
  save(changes: ApplicationChanges): void;
  view: ApplicationConnection;
  onRemoved(): void;
}) {
  const { t } = useTranslation("personal");
  const [name, setName] = useState(connection.displayName);
  const [open, setOpen] = useState(false);
  const app = APPLICATION_CATALOG.find(
    (item) => item.id === connection.applicationId,
  );

  function commitName() {
    const next = name.trim();
    if (!next) {
      setName(view.displayName);
      return;
    }
    if (next !== view.displayName) save({ displayName: next });
  }

  return (
    <Collapsible
      className="flex flex-col gap-4"
      open={open}
      onOpenChange={setOpen}
    >
      <CollapsibleTrigger
        className="flex h-8 items-center gap-1.5 self-start text-start text-body text-muted-foreground hover:text-foreground"
        type="button"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 transition-transform rtl:-scale-x-100",
            open && "rotate-90",
          )}
        />
        {t("apps.advanced", { defaultValue: "Advanced settings" })}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-6">
        <SettingsGroup
          title={t("apps.connection", { defaultValue: "Connection" })}
        >
          <div className="flex flex-col gap-2 py-3.5">
            <Label htmlFor="application-name">
              {t("apps.name", { defaultValue: "Connection name" })}
            </Label>
            <Input
              id="application-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={commitName}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
              disabled={disabled}
              maxLength={160}
            />
          </div>
          <SettingRow title={t("apps.enabled", { defaultValue: "Enabled" })}>
            <Switch
              checked={view.enabled}
              onCheckedChange={(enabled) => save({ enabled })}
              disabled={disabled}
              aria-label={t("apps.enabled", { defaultValue: "Enabled" })}
            />
          </SettingRow>
          <SettingRow
            title={t("apps.delegated", {
              defaultValue: "Allow delegated work",
            })}
            description={t("apps.delegatedDescription", {
              defaultValue:
                "Work sessions and teammates these assistants delegate can also use this account.",
            })}
          >
            <Switch
              checked={view.allowDelegatedWork}
              onCheckedChange={(allowDelegatedWork) =>
                save({ allowDelegatedWork })
              }
              disabled={disabled}
              aria-label={t("apps.delegated", {
                defaultValue: "Allow delegated work",
              })}
            />
          </SettingRow>
          <SettingRow
            title={t("apps.workSessions")}
            description={t("apps.workSessionsDescription")}
          >
            <Switch
              aria-label={t("apps.workSessions")}
              checked={view.allowWorkSessions}
              disabled={disabled}
              onCheckedChange={(allowWorkSessions) =>
                save({ allowWorkSessions })
              }
            />
          </SettingRow>
        </SettingsGroup>
        <ApplicationTools connection={connection} />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() =>
              void run(() =>
                requestDaemon("application.logout", { id: connection.id }),
              )
            }
          >
            <LogOut className="size-3.5" />
            {t("apps.signOut", { defaultValue: "Sign out" })}
          </Button>
          {app ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void desktopApi.openExternal(app.documentationUrl)}
            >
              <ArrowUpRight className="size-3.5" />
              {t("apps.providerDocs", {
                defaultValue: "Provider instructions",
              })}
            </Button>
          ) : null}
          <AppRemoveButton
            disabled={disabled}
            label={t("apps.remove", { defaultValue: "Remove connection" })}
            confirmTitle={t("apps.remove", {
              defaultValue: "Remove connection",
            })}
            confirmDescription={t("apps.removeDescription", {
              defaultValue:
                "Remove this host connection and its saved authorization? Provider-side authorization may also need revoking in the provider's account settings.",
            })}
            confirmLabel={t("apps.remove", {
              defaultValue: "Remove connection",
            })}
            cancelLabel={t("apps.cancel", { defaultValue: "Cancel" })}
            onConfirm={() =>
              void run(async () => {
                await requestDaemon("application.remove", {
                  id: connection.id,
                });
                onRemoved();
              })
            }
          />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
