import { CornerDownLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Textarea } from "@/components/ui";

// Free-text revision notes for a parked plan. Submitting with an empty body is
// deliberate and supported: the agent then asks the user what to change, so the
// UI does not need to invent a placeholder message.
export function PlanApprovalFeedback({
  disabled,
  onCancel,
  onSubmit,
}: {
  disabled: boolean;
  onCancel(): void;
  onSubmit(feedback: string): Promise<void> | void;
}) {
  const { t } = useTranslation("agent");
  const [feedback, setFeedback] = useState("");

  const handleSubmit = async () => {
    if (disabled) {
      return;
    }

    await onSubmit(feedback.trim());
  };

  return (
    <div className="space-y-2 border-chat-border-soft border-t px-3 py-2.5">
      <label
        className="text-meta font-medium text-chat-fg-muted"
        htmlFor="plan-approval-feedback"
      >
        {t("planApproval.feedbackLabel")}
      </label>
      <Textarea
        autoFocus
        className="min-h-16 resize-none border-chat-border-soft bg-chat-surface-input text-body text-chat-fg"
        id="plan-approval-feedback"
        onChange={(event) => setFeedback(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void handleSubmit();
          }
        }}
        placeholder={t("planApproval.feedbackPlaceholder")}
        value={feedback}
      />
      <div className="flex items-center justify-end gap-1.5">
        <Button
          disabled={disabled}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("planApproval.feedbackDismiss")}
        </Button>
        <Button
          disabled={disabled}
          onClick={() => void handleSubmit()}
          size="sm"
          type="button"
        >
          <CornerDownLeft className="size-3.5" />
          {t("planApproval.feedbackSend")}
        </Button>
      </div>
    </div>
  );
}
