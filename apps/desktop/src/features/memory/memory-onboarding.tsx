import { useTranslation } from "react-i18next";
import { Button, Text } from "@/components/ui";
import { useMemoryOnboarding } from "./memory-onboarding-state";

export function MemoryOnboarding() {
  const { t } = useTranslation("memory");
  const { stage, enable, skip } = useMemoryOnboarding();

  if (stage !== "offer") return null;

  return (
    <section
      aria-label={t("onboarding.title")}
      className="mx-3 mb-3 flex flex-col gap-1 rounded-card bg-sidebar-surface-hover p-3"
    >
      <Text size="body" weight="medium">
        {t("onboarding.title")}
      </Text>
      <Text size="meta" tone="muted">
        {t("onboarding.description")}
      </Text>
      <div className="mt-2 flex items-center justify-end gap-2">
        <Button onClick={skip} size="sm" variant="ghost">
          {t("onboarding.skip")}
        </Button>
        <Button onClick={() => void enable()} size="sm">
          {t("onboarding.enable")}
        </Button>
      </div>
    </section>
  );
}
