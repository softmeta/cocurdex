import * as Clipboard from "expo-clipboard";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { type MenuAnchor, useAnchoredMenu } from "@/ui";

export function useMessageActions() {
  const { t } = useTranslation("sessions");
  const menu = useAnchoredMenu("message-actions");
  const openMenu = useRef(menu.open);
  openMenu.current = menu.open;
  const open = useCallback(
    (text: string, anchor: MenuAnchor) =>
      openMenu.current(anchor, {
        items: [
          {
            key: "copy",
            testID: "message-action-copy",
            label: t("message.copy"),
            icon: { ios: "doc.on.doc", android: "content_copy" },
            onPress: () => void Clipboard.setStringAsync(text),
          },
        ],
      }),
    [t],
  );
  return { open, menu: menu.menu };
}
