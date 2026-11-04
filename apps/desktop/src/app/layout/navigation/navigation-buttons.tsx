import { useAtomValue, useSetAtom } from "jotai";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useResolvedShortcutLabel } from "@/features/shortcuts";
import { TitlebarIconButton } from "../titlebar-icon-button";
import { canNavigate } from "./navigation-history";
import { navigateAtom, navigationHistoryAtom } from "./navigation-store";

function withShortcut(label: string, shortcut: string) {
  return shortcut ? `${label} (${shortcut})` : label;
}

export function NavigationButtons() {
  const { t } = useTranslation("editor");
  const history = useAtomValue(navigationHistoryAtom);
  const canGoBack = canNavigate(history, "back");
  const canGoForward = canNavigate(history, "forward");
  const navigate = useSetAtom(navigateAtom);
  const backShortcut = useResolvedShortcutLabel("navigateBack");
  const forwardShortcut = useResolvedShortcutLabel("navigateForward");

  return (
    <fieldset
      aria-label={t("actions.navigationHistory")}
      data-history-index={history.index}
      data-history-length={history.entries.length}
      className="contents"
    >
      <TitlebarIconButton
        aria-label={t("actions.navigateBack")}
        tooltip={withShortcut(t("actions.navigateBack"), backShortcut)}
        cursor="default"
        disabled={!canGoBack}
        onClick={() => navigate("back")}
      >
        <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
      </TitlebarIconButton>
      <TitlebarIconButton
        aria-label={t("actions.navigateForward")}
        tooltip={withShortcut(t("actions.navigateForward"), forwardShortcut)}
        cursor="default"
        disabled={!canGoForward}
        onClick={() => navigate("forward")}
      >
        <ArrowRight className="size-3.5 rtl:-scale-x-100" />
      </TitlebarIconButton>
    </fieldset>
  );
}
