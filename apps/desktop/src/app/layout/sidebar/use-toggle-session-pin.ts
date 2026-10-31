import type { SessionRecord } from "@cocurdex/shared";
import { useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { setSessionPinnedAtom } from "@/features/sessions";
import { desktopApi, logRendererDiagnostic } from "@/lib";

export function useToggleSessionPin() {
  const { t } = useTranslation("sessions");
  const setSessionPinned = useSetAtom(setSessionPinnedAtom);

  return (session: SessionRecord) => {
    const previousPinnedAt = session.pinnedAt ?? null;
    const pinned = !previousPinnedAt;
    setSessionPinned({
      sessionId: session.id,
      pinnedAt: pinned ? new Date().toISOString() : null,
    });
    void desktopApi
      .setSessionPinned({ sessionId: session.id, pinned })
      .then((updated) => {
        if (updated) {
          setSessionPinned({
            sessionId: session.id,
            pinnedAt: updated.pinnedAt ?? null,
          });
        }
      })
      .catch((error) => {
        setSessionPinned({ sessionId: session.id, pinnedAt: previousPinnedAt });
        toast.error(t("sidebar.pinFailed"));
        logRendererDiagnostic("debug", "[SessionPin] toggle failed", {
          sessionId: session.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      });
  };
}
