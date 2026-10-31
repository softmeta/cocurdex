import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";

export function AppCopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation("common");
  const [copied, setCopied] = useState(false);
  return (
    <Button
      aria-label={label ?? t("actions.copy")}
      className={className}
      size="icon-sm"
      type="button"
      variant="ghost"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1_200);
          })
          .catch(() => {});
      }}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </Button>
  );
}
