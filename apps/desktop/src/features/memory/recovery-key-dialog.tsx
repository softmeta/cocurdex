import { useTranslation } from "react-i18next";
import { AppCopyButton } from "@/components/app";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from "@/components/ui";

export function RecoveryKeyDialog({
  content,
  onClose,
}: {
  content: string;
  onClose(): void;
}) {
  const { t } = useTranslation("memory");
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="default">
        <DialogHeader>
          <DialogTitle>{t("settings.keys.title")}</DialogTitle>
          <DialogDescription>
            {t("settings.keys.description")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-w-0 items-start gap-2">
          <Text
            as="pre"
            className="max-h-72 min-w-0 flex-1 overflow-auto break-all whitespace-pre-wrap"
            size="meta"
            tone="muted"
          >
            {content}
          </Text>
          <AppCopyButton label={t("settings.keys.copy")} value={content} />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("settings.keys.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
