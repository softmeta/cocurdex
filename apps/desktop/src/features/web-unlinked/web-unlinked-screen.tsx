import { useTranslation } from "react-i18next";
import { CocurdexMark } from "@/components/cocurdex-mark";
import { Text } from "@/components/ui";

export function WebUnlinkedScreen() {
  const { t } = useTranslation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-app px-4 text-app-foreground">
      <div className="flex w-full max-w-sm flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <CocurdexMark className="size-7" />
          <Text as="h1" size="title" weight="medium">
            {t("webUnlinked.title")}
          </Text>
        </div>
        <Text size="body" tone="muted">
          {t("webUnlinked.description")}
        </Text>
      </div>
    </main>
  );
}
