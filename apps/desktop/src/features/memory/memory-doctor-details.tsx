import type { MemoryDoctorCheck, MemoryStatus } from "@cocurdex/shared";
import type { TFunction } from "i18next";
import { ChevronRight, Copy } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Text,
} from "@/components/ui";

function needsAttention(check: MemoryDoctorCheck) {
  return check.status === "warn" || check.status === "fail";
}

function checkLine(check: MemoryDoctorCheck) {
  const action = check.action ? `\n    → ${check.action}` : "";
  return `[${check.status}] ${check.name}: ${check.value}${action}`;
}

function fullReport(status: MemoryStatus) {
  const doctor = status.doctor;
  const lines = [
    `installation: ${status.installation}`,
    `version: ${status.version ?? "-"}`,
    `runtime: ${status.runtimeVersion ?? "-"}`,
    `executable: ${status.executable ?? "-"}`,
    `dataDir: ${status.dataDir ?? "-"}`,
  ];
  if (status.error) lines.push(`error: ${status.error}`);
  if (doctor) {
    lines.push(
      "",
      `doctor: ${doctor.status} (${doctor.version ?? "-"}, ${doctor.checkedAt})`,
      ...doctor.checks.map(checkLine),
    );
  }
  return lines.join("\n");
}

function DoctorSummary({
  t,
  status,
}: {
  t: TFunction<"memory">;
  status: MemoryStatus;
}) {
  const doctor = status.doctor;
  if (!doctor) return null;
  const summary = t("settings.status.doctor", {
    status: doctor.status,
    pass: doctor.summary.pass,
    warn: doctor.summary.warn,
    fail: doctor.summary.fail,
  });
  const flagged = doctor.checks.filter(needsAttention);
  if (flagged.length === 0) {
    return (
      <Text className="mt-1 block" size="meta" tone="muted">
        {summary}
      </Text>
    );
  }
  return (
    <Collapsible className="mt-1">
      <CollapsibleTrigger
        className="group flex items-center gap-1.5 text-start text-muted-foreground hover:text-foreground"
        type="button"
      >
        <ChevronRight className="size-3.5 shrink-0 transition-transform group-data-[panel-open]:rotate-90 rtl:-scale-x-100" />
        <Text size="meta">{summary}</Text>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul
          aria-label={t("settings.status.flaggedChecks")}
          className="mt-1.5 flex flex-col gap-1.5 ps-5"
        >
          {flagged.map((check) => (
            <li key={check.name} className="flex flex-col">
              <Text className="font-mono" size="meta">
                {`${check.status} · ${check.name}`}
              </Text>
              <Text className="break-all" size="meta" tone="muted">
                {check.value}
              </Text>
              {check.action ? (
                <Text className="break-all" size="meta" tone="muted">
                  {t("settings.status.checkAction", { action: check.action })}
                </Text>
              ) : null}
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function MemoryDoctorDetails({ status }: { status: MemoryStatus }) {
  const { t } = useTranslation("memory");
  if (!status.doctor && !status.error) return null;

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(fullReport(status));
      toast.success(t("settings.status.reportCopied"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t("settings.status.copyFailed"),
      );
    }
  };

  return (
    <>
      <DoctorSummary status={status} t={t} />
      {status.error ? (
        <Text
          className="mt-1 block whitespace-pre-wrap"
          size="meta"
          tone="muted"
        >
          {status.error}
        </Text>
      ) : null}
      <Button
        className="mt-1 -ms-2.5 self-start"
        size="sm"
        variant="ghost"
        onClick={() => void copyReport()}
      >
        <Copy className="size-3.5" />
        {t("settings.status.copyReport")}
      </Button>
    </>
  );
}
