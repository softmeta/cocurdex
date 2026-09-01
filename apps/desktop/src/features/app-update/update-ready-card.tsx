import { useTranslation } from "react-i18next";
import { Button, Text } from "@/components/ui";
import { desktopApi } from "@/lib";
import {
  dismissAppUpdate,
  installAppUpdate,
  useAppUpdateState,
} from "./app-update-store";

export function UpdateReadyCard() {
  const { t } = useTranslation("settings");
  const state = useAppUpdateState();
  const visible =
    state.status === "ready" &&
    state.availableVersion !== null &&
    state.dismissedVersion !== state.availableVersion;

  if (!visible || state.availableVersion === null) {
    return null;
  }

  const version = state.availableVersion;
  const releaseNotesUrl = state.releaseNotesUrl;

  return (
    <div className="pointer-events-auto fixed end-4 bottom-4 z-50 w-[calc(100%-2rem)] max-w-sm rounded-card border border-border/40 bg-popover p-4 shadow-md">
      <Text size="body" weight="semibold">
        {t("updates.card.title")}
      </Text>
      <Text className="mt-1" size="body" tone="muted">
        {t("updates.card.body", { version })}
      </Text>
      <div className="mt-3 flex items-center justify-between gap-3">
        {releaseNotesUrl ? (
          <Button
            className="px-0"
            size="sm"
            variant="link"
            onClick={() => {
              void desktopApi.openExternal(releaseNotesUrl);
            }}
          >
            {t("updates.card.changelog")}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void dismissAppUpdate();
            }}
          >
            {t("updates.card.later")}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              void installAppUpdate();
            }}
          >
            {t("updates.card.install")}
          </Button>
        </div>
      </div>
    </div>
  );
}
