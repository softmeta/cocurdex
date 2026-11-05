import { Newspaper } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppSidebarIconButton } from "@/components/app";
import { useBrief } from "@/features/inbox";
import { usePersonalAgents } from "@/features/personal";

export function BriefControl({
  onOpenSession,
}: {
  onOpenSession(sessionId: string): void;
}) {
  const { t } = useTranslation("personal");
  const { brief, post } = useBrief();
  const { agents } = usePersonalAgents(t("defaultName"));
  const homeSessionId =
    agents.find((agent) => agent.isDefault)?.homeSessionId ?? null;
  if (!brief || !homeSessionId) return null;

  const openBrief = async () => {
    await post(brief);
    onOpenSession(homeSessionId);
  };

  return (
    <AppSidebarIconButton
      aria-label={t("brief.open")}
      onClick={() => void openBrief()}
    >
      <Newspaper className="size-3.5" />
    </AppSidebarIconButton>
  );
}
