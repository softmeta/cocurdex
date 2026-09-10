import type { AgentQuestionRequestRecord } from "@cocurdex/shared";
import { Check, CircleHelp, CornerDownLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button, Textarea } from "@/components/ui";
import { cn } from "@/lib";

function QuestionOptionRow({
  description,
  disabled,
  isSelected,
  label,
  multiSelect,
  onSelect,
}: {
  description?: string;
  disabled: boolean;
  isSelected: boolean;
  label: string;
  multiSelect: boolean;
  onSelect(): void;
}) {
  return (
    <button
      aria-pressed={isSelected}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-control border px-3 py-2 text-start transition-colors outline-none focus-visible:ring-1 focus-visible:ring-ring/50",
        isSelected
          ? "border-chat-border-accent bg-primary/10 text-chat-fg"
          : "border-chat-border-soft text-chat-fg-secondary hover:border-chat-border hover:bg-chat-surface-row-hover hover:text-chat-fg",
      )}
      disabled={disabled}
      onClick={onSelect}
      onPointerDown={(event) => {
        event.preventDefault();
      }}
      type="button"
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-3.5 shrink-0 items-center justify-center border",
          multiSelect ? "rounded-dense" : "rounded-full",
          isSelected
            ? "border-primary bg-primary text-primary-foreground"
            : "border-chat-fg-muted",
        )}
      >
        {isSelected ? <Check className="size-2.5" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-body font-medium">{label}</div>
        {description ? (
          <div className="mt-0.5 text-meta text-chat-fg-muted">
            {description}
          </div>
        ) : null}
      </div>
    </button>
  );
}

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
  const isDock = variant === "dock";
  const selectedAnswer = selectedOptions.join(", ");
  const submittedAnswer = answer.trim() || selectedAnswer;
  const canSubmit = isPending && submittedAnswer.length > 0 && !isSubmitting;

  const toggleOption = (label: string) => {
    setSelectedOptions((current) => {
      if (current.includes(label)) {
        return current.filter((value) => value !== label);
      }

      if (question.multiSelect) {
        return [...current, label];
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
        "w-full overflow-hidden rounded-panel border border-chat-border bg-chat-surface-raised text-chat-fg shadow-chat-soft",
        isDock ? null : "max-w-3xl",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2",
          isDock ? "px-3 pt-2.5 pb-1.5" : "px-4 pt-3 pb-2",
        )}
      >
        <div className="flex size-6 shrink-0 items-center justify-center rounded-control bg-chat-status-pending-bg text-chat-status-pending-fg">
          <CircleHelp className="size-3.5" />
        </div>
        <h3
          className={cn(
            "min-w-0 flex-1 truncate font-medium text-chat-fg",
            isDock ? "text-body" : "text-display",
          )}
        >
          {question.question}
        </h3>
        <span className="shrink-0 rounded-full bg-chat-status-pending-bg px-1.5 py-px text-meta font-medium text-chat-status-pending-fg">
          {t("questions.pending")}
        </span>
      </div>

      {question.options?.length || question.header ? (
        <div className={cn("space-y-2", isDock ? "px-3 pb-2.5" : "px-4 pb-3")}>
          {question.header ? (
            <div className="text-meta font-medium text-chat-fg-muted">
              {question.header}
            </div>
          ) : null}
          {question.options?.length ? (
            <div className="grid gap-1.5">
              {question.options.map((option) => (
                <QuestionOptionRow
                  description={option.description}
                  disabled={isSubmitting}
                  isSelected={selectedOptions.includes(option.label)}
                  key={option.label}
                  label={option.label}
                  multiSelect={Boolean(question.multiSelect)}
                  onSelect={() => toggleOption(option.label)}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className={cn(
          "space-y-2 border-chat-border-soft border-t",
          isDock ? "px-3 py-2.5" : "px-4 py-3",
        )}
      >
        <Textarea
          className="min-h-16 resize-none border-chat-border-soft bg-chat-surface-input text-body text-chat-fg"
          disabled={isSubmitting}
          onChange={(event) => {
            const value = event.target.value;
            setAnswer(value);
            if (value.trim().length > 0) {
              setSelectedOptions([]);
            }
          }}
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
            <CornerDownLeft className="size-3.5" />
            {t("questions.answer")}
          </Button>
        </div>
      </div>
    </article>
  );
}
