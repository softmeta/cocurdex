import type { AgentQuestionRequestRecord } from "@cocurdex/shared";
import { CornerDownLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Textarea } from "@/components/ui";
import { cn } from "@/lib";

export function QuestionCard({
  onAnswer,
  question,
  variant = "timeline",
}: {
  onAnswer?(
    question: AgentQuestionRequestRecord,
    answer: string,
  ): Promise<void> | void;
  question: AgentQuestionRequestRecord;
  variant?: "timeline" | "dock";
}) {
  const { t } = useTranslation("agent");
  const [answer, setAnswer] = useState("");
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isPending = question.status === "pending";
  const selectedAnswer = selectedOptions.join(", ");
  const submittedAnswer = answer.trim() || selectedAnswer;
  const canSubmit = isPending && submittedAnswer.length > 0 && !isSubmitting;

  const toggleOption = (label: string) => {
    setSelectedOptions((current) => {
      if (question.multiSelect) {
        return current.includes(label)
          ? current.filter((value) => value !== label)
          : [...current, label];
      }

      return [label];
    });
    setAnswer("");
  };

  const handleSubmit = async () => {
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    try {
      await onAnswer?.(question, submittedAnswer);
      setAnswer("");
      setSelectedOptions([]);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isPending) {
    return (
      <div className="flex w-full max-w-3xl items-baseline gap-2 px-1 py-1 text-body">
        <span className="shrink-0 text-chat-fg-muted">{question.question}</span>
        <span className="min-w-0 truncate text-chat-fg-secondary">
          {question.answer}
        </span>
      </div>
    );
  }

  return (
    <article
      className={cn(
        "w-full max-w-3xl rounded-control border border-chat-border-soft bg-chat-surface-input/70 p-3 text-chat-fg shadow-chat-card",
        variant === "dock" && "max-w-none",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="text-meta font-medium uppercase tracking-[0.16em] text-chat-fg-muted">
            {t("questions.title")}
          </div>
          <p className="break-words text-sm text-chat-fg-secondary">
            {question.question}
          </p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full border px-2 py-0.5 text-xs",
            isPending
              ? "border-amber-500/30 text-amber-300"
              : "border-emerald-500/30 text-emerald-300",
          )}
        >
          {isPending ? t("questions.pending") : t("questions.answered")}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {question.header ? (
          <div className="text-meta font-medium text-chat-fg-muted">
            {question.header}
          </div>
        ) : null}
        {question.options?.length ? (
          <div className="grid gap-2">
            {question.options.map((option) => {
              const isSelected = selectedOptions.includes(option.label);
              return (
                <button
                  aria-pressed={isSelected}
                  className={cn(
                    "rounded-control border px-3 py-2 text-start transition-colors",
                    isSelected
                      ? "border-primary bg-primary/10 text-chat-fg"
                      : "border-chat-border-soft bg-chat-surface-subtle text-chat-fg-secondary hover:bg-chat-surface-input",
                  )}
                  key={option.label}
                  onClick={() => toggleOption(option.label)}
                  type="button"
                >
                  <div className="text-sm font-medium">{option.label}</div>
                  <div className="mt-0.5 text-meta text-chat-fg-muted">
                    {option.description}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
        <Textarea
          className="min-h-20 resize-none border-chat-border-soft bg-chat-surface-subtle text-sm text-chat-fg"
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder={t("questions.placeholder")}
          value={answer}
        />
        <div className="flex justify-end">
          <Button
            disabled={!canSubmit}
            onClick={() => void handleSubmit()}
            size="sm"
            type="button"
          >
            <CornerDownLeft className="size-4" />
            {t("questions.answer")}
          </Button>
        </div>
      </div>
    </article>
  );
}
