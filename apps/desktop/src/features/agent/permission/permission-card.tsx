import type {
  AgentPermissionOption,
  AgentPermissionRequestRecord,
} from "@cocurdex/shared";
import { Check, ShieldAlert, X } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { AppSelect } from "@/components";
import { Button } from "@/components/ui";
import { cn } from "@/lib";
import {
  filterDetailsCoveredByText,
  formatRawInput,
  getClaudePermissionDetails,
  getReadablePermissionDetails,
  type PermissionDetail,
} from "./permission-card-utils";

type PermissionCardVariant = "inline" | "dock";

function getPermissionOptionVariant(option: AgentPermissionOption) {
  if (option.kind === "allow_once") {
    return "default";
  }

  if (option.kind === "allow_always" || option.kind === "reject_always") {
    return "secondary";
  }

  return "ghost";
}

function PermissionOptionIcon({ option }: { option: AgentPermissionOption }) {
  if (option.kind === "allow_once") {
    return <Check className="size-3.5" />;
  }

  if (option.kind.startsWith("reject")) {
    return <X className="size-3.5" />;
  }

  return null;
}

function getStatusLabel(
  permission: AgentPermissionRequestRecord,
  t: (
    key: "permissions.allowed" | "permissions.denied" | "permissions.pending",
  ) => string,
) {
  if (permission.status === "allowed") {
    return t("permissions.allowed");
  }

  if (permission.status === "denied") {
    return t("permissions.denied");
  }

  return t("permissions.pending");
}

function getStatusClasses(permission: AgentPermissionRequestRecord) {
  if (permission.status === "allowed") {
    return "bg-chat-status-completed-bg text-chat-status-completed-fg";
  }

  if (permission.status === "denied") {
    return "bg-chat-status-failed-bg text-chat-status-failed-fg";
  }

  return "bg-chat-status-pending-bg text-chat-status-pending-fg";
}

function PermissionDetailPanel({ detail }: { detail: PermissionDetail }) {
  const { t } = useTranslation("agent");
  const [expanded, setExpanded] = useState(false);
  const canExpand = detail.value.length > 160;
  const label = {
    Command: t("permissions.command"),
    Path: t("permissions.path"),
    Pattern: t("permissions.pattern"),
    Query: t("permissions.query"),
    URL: t("permissions.url"),
  }[detail.label];

  // Flat detail: small label + value. No nested bordered "card in a card"
  // chrome (that was the heavy look on dock permission prompts).
  return (
    <div className="min-w-0">
      <div className="mb-1 flex min-h-5 items-center justify-between gap-2">
        <span className="text-meta font-medium text-chat-fg-muted">
          {label}
        </span>
        {canExpand ? (
          <Button
            className="h-5 px-1 text-meta text-chat-fg-muted"
            onClick={() => setExpanded((value) => !value)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {expanded ? t("permissions.showLess") : t("permissions.showMore")}
          </Button>
        ) : null}
      </div>
      <div
        className={cn(
          "rounded-control bg-chat-code-panel px-2.5 py-2 text-body leading-5 text-chat-fg-secondary",
          detail.monospace &&
            "font-mono text-meta [font-variant-ligatures:none]",
          canExpand && !expanded
            ? "line-clamp-3 break-all"
            : "max-h-40 overflow-auto whitespace-pre-wrap break-words",
        )}
      >
        {detail.value}
      </div>
    </div>
  );
}

function PermissionCardActions({
  isDock,
  isResolving,
  onResolve,
  permission,
}: {
  isDock: boolean;
  isResolving: boolean;
  onResolve(optionId: string): Promise<void> | void;
  permission: AgentPermissionRequestRecord;
}) {
  const { t } = useTranslation("agent");
  const allowOptions = permission.options.filter((option) =>
    option.kind.startsWith("allow"),
  );
  const trailingOptions = permission.options.filter(
    (option) => !option.kind.startsWith("allow"),
  );
  const defaultAllowOption = allowOptions[0];

  const getOptionLabel = (option: AgentPermissionOption) => {
    const genericLabel = {
      allow_always: t("permissions.alwaysAllow"),
      allow_once: t("permissions.allowOnce"),
      reject_always: t("permissions.rejectAlways"),
      reject_once: t("permissions.deny"),
    }[option.kind];
    return option.labelSource === "provider" ? option.label : genericLabel;
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-end gap-1.5 border-chat-border-soft border-t",
        isDock ? "px-3 py-2" : "px-4 py-3",
      )}
    >
      {defaultAllowOption ? (
        allowOptions.length > 1 ? (
          <AppSelect
            disabled={isResolving}
            onValueChange={(optionId) => void onResolve(optionId)}
            options={allowOptions.map((option) => ({
              label: getOptionLabel(option),
              value: option.id,
            }))}
            align="end"
            triggerAriaLabel={getOptionLabel(defaultAllowOption)}
            triggerClassName="max-w-full"
            triggerLabel={
              <span className="flex min-w-0 items-center gap-1.5">
                <Check className="size-3.5 shrink-0" />
                <span className="min-w-0 truncate">
                  {getOptionLabel(defaultAllowOption)}
                </span>
              </span>
            }
            value={defaultAllowOption.id}
          />
        ) : (
          <Button
            disabled={isResolving}
            onClick={() => void onResolve(defaultAllowOption.id)}
            size="sm"
            type="button"
            variant={getPermissionOptionVariant(defaultAllowOption)}
          >
            <PermissionOptionIcon option={defaultAllowOption} />
            {getOptionLabel(defaultAllowOption)}
          </Button>
        )
      ) : null}
      {trailingOptions.map((option) => (
        <Button
          disabled={isResolving}
          key={option.id}
          onClick={() => void onResolve(option.id)}
          size="sm"
          type="button"
          variant={getPermissionOptionVariant(option)}
        >
          <PermissionOptionIcon option={option} />
          {getOptionLabel(option)}
        </Button>
      ))}
    </div>
  );
}

export function PermissionCard({
  onResolve,
  permission,
  variant = "inline",
}: {
  onResolve?(
    requestId: string,
    optionId: string,
  ): Promise<boolean | undefined> | undefined;
  permission: AgentPermissionRequestRecord;
  variant?: PermissionCardVariant;
}) {
  const { t } = useTranslation("agent");
  const [isResolving, setIsResolving] = useState(false);
  const rawInput = formatRawInput(permission.rawInput);
  const isPending = permission.status === "pending";
  const claudeDetails = getClaudePermissionDetails(permission);
  const primaryPath = claudeDetails?.path ?? permission.locations[0]?.path;
  const sourceDescription =
    claudeDetails?.subtitle ?? permission.description ?? null;
  const readableDetails = getReadablePermissionDetails({
    displayDescription: sourceDescription,
    permission,
    primaryPath,
  });
  const hasCommand = readableDetails.some(
    (detail) => detail.label === "Command",
  );
  let requestSummary = permission.title;
  if (claudeDetails) {
    requestSummary = t("permissions.claudeAction", {
      action: t(`permissions.actions.${claudeDetails.action}`),
      target: claudeDetails.target,
    });
  }
  if (hasCommand) {
    requestSummary = t("permissions.runCommand");
  }
  const displayDescription = hasCommand ? null : sourceDescription;
  const visibleDescription =
    displayDescription !== null &&
    !requestSummary.includes(displayDescription.trim())
      ? displayDescription
      : null;
  const visibleDetails = filterDetailsCoveredByText(readableDetails, [
    requestSummary,
    displayDescription,
  ]);
  const shouldShowRawInput =
    rawInput &&
    readableDetails.length === 0 &&
    permission.providerId !== "claude-agent";
  const hasBody =
    requestSummary.length > 0 ||
    visibleDescription !== null ||
    visibleDetails.length > 0 ||
    Boolean(shouldShowRawInput);
  const isDock = variant === "dock";

  const handleResolve = async (optionId: string) => {
    if (!isPending || isResolving) {
      return;
    }

    setIsResolving(true);
    try {
      const resolved = await onResolve?.(permission.id, optionId);
      if (resolved === false) {
        toast.error(t("permissions.resolveFailed"));
      }
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <article
      className={cn(
        "w-full overflow-hidden rounded-panel border border-chat-border bg-chat-surface-raised text-chat-fg shadow-chat-soft",
        isDock ? null : "max-w-3xl",
      )}
    >
      <div
        className={cn(
          "flex items-center gap-2.5",
          isDock ? "px-3 pt-3 pb-2" : "px-4 pt-4 pb-3",
        )}
      >
        <div
          className={cn(
            "flex size-6 shrink-0 items-center justify-center rounded-control",
            getStatusClasses(permission),
          )}
        >
          <ShieldAlert className="size-3.5" />
        </div>
        <h3
          className={cn(
            "min-w-0 flex-1 truncate font-semibold text-chat-fg",
            isDock ? "text-body" : "text-display",
          )}
        >
          {t("permissions.title")}
        </h3>
        <span
          className={cn(
            "shrink-0 rounded-full px-1.5 py-px text-meta font-medium",
            getStatusClasses(permission),
          )}
        >
          {getStatusLabel(permission, t)}
        </span>
      </div>

      {hasBody ? (
        <div
          className={cn(
            "space-y-2.5",
            isDock ? "px-3 pt-2.5 pb-5" : "px-4 pt-2.5 pb-6",
            // Indent body under the header text column on roomy layouts.
            !isDock && "ps-[3.125rem]",
          )}
        >
          {requestSummary.length > 0 ? (
            <p className="break-words text-body text-chat-fg">
              {requestSummary}
            </p>
          ) : null}
          {visibleDescription ? (
            <p className="line-clamp-2 text-body text-chat-fg-muted">
              {visibleDescription}
            </p>
          ) : null}
          {visibleDetails.map((detail) => (
            <PermissionDetailPanel
              detail={detail}
              key={`${detail.label}:${detail.value}`}
            />
          ))}
          {shouldShowRawInput ? (
            <pre className="max-h-36 overflow-auto whitespace-pre-wrap break-words rounded-control bg-chat-code-panel px-2.5 py-2 font-mono text-meta text-chat-fg-secondary [font-variant-ligatures:none]">
              {rawInput}
            </pre>
          ) : null}
        </div>
      ) : null}

      {isPending ? (
        <PermissionCardActions
          isDock={isDock}
          isResolving={isResolving}
          onResolve={handleResolve}
          permission={permission}
        />
      ) : null}
    </article>
  );
}
