import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Spinner, Text } from "@/components/ui";
import type { AppUpdateState } from "@/lib/types";
import {
  checkForAppUpdate,
  installAppUpdate,
  useAppUpdateState,
} from "./app-update-store";

function statusText(state: AppUpdateState, t: TFunction<"settings">) {
  switch (state.status) {
    case "unsupported":
      return t("updates.status.unsupported");
    case "checking":
      return t("updates.status.checking");
    case "downloading":
      return t("updates.status.downloading", {
        version: state.availableVersion ?? "",
      });
    case "ready":
      return t("updates.status.ready", {
        version: state.availableVersion ?? "",
      });
    case "error":
      return t("updates.status.error", {
        message: state.errorMessage ?? "",
      });
    case "idle":
      return t("updates.status.upToDate", { version: state.currentVersion });
  }
}

export function AppUpdateSettingsPanel() {
  const { t } = useTranslation("settings");
  const state = useAppUpdateState();
  const [busy, setBusy] = useState(false);
  const inFlight =
    busy || state.status === "checking" || state.status === "downloading";
  const canCheck = state.status !== "unsupported" && !inFlight;
  const canInstall = state.status === "ready" && !inFlight;

  const runCheck = async () => {
    setBusy(true);
    try {
      await checkForAppUpdate();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-6 py-3.5">
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium text-foreground">
          {t("updates.title")}
        </div>
        <div className="mt-0.5 text-body text-muted-foreground">
          {t("updates.description", { version: state.currentVersion })}
        </div>
        <Text className="mt-2 block" size="meta" tone="muted">
          {statusText(state, t)}
        </Text>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {inFlight ? <Spinner size="md" /> : null}
        {canInstall ? (
          <Button
            size="sm"
            onClick={() => {
              void installAppUpdate();
            }}
          >
            {t("updates.actions.install")}
          </Button>
        ) : null}
        <Button
          disabled={!canCheck}
          size="sm"
          variant="outline"
          onClick={() => {
            void runCheck();
          }}
        >
          {t("updates.actions.check")}
        </Button>
      </div>
    </div>
  );
}
