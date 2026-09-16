import {
  clampScriptRunMaxAgents,
  SCRIPT_RUN_HARD_MAX_AGENTS,
  type ScriptRunRecord,
} from "@cocurdex/shared";
import { ChevronRight, Workflow } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Input,
  Text,
} from "@/components/ui";
import { desktopApi } from "@/lib";
import { useScriptRuns } from "./use-script-runs";

export function ScriptRunProposalCard({ run }: { run: ScriptRunRecord }) {
  const { t } = useTranslation("agent");
  const [maxAgents, setMaxAgents] = useState(String(run.maxAgents));
  const [busy, setBusy] = useState(false);

  const act = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      setBusy(false);
    }
  };

  const handleRun = () =>
    act(() =>
      desktopApi.startScriptRun({
        runId: run.id,
        maxAgents: clampScriptRunMaxAgents(Number(maxAgents), run.maxAgents),
      }),
    );

  return (
    <section
      aria-label={t("scriptRun.proposalLabel", { name: run.name })}
      className="flex w-full min-w-0 flex-col gap-2 rounded-panel border border-chat-border bg-chat-surface-raised px-3.5 py-3 text-chat-fg"
    >
      <div className="flex min-w-0 items-center gap-2">
        <Workflow className="size-4 shrink-0 text-chat-fg-muted" />
        <Text className="min-w-0 flex-1" truncate weight="medium">
          {t("scriptRun.proposalTitle", { name: run.name })}
        </Text>
        <Text className="shrink-0" size="meta" tone="muted">
          {t("scriptRun.status.draft")}
        </Text>
      </div>
      <Collapsible>
        <CollapsibleTrigger className="group/script-trigger flex items-center gap-1 rounded-dense text-meta text-chat-fg-muted hover:text-chat-fg">
          <ChevronRight className="size-3.5 transition-transform group-data-[panel-open]/script-trigger:rotate-90" />
          {t("scriptRun.showScript")}
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-1.5 max-h-72 overflow-auto rounded-control border border-chat-border-soft bg-chat-surface-subtle px-3 py-2 font-mono text-meta leading-5 text-chat-fg-secondary">
            {run.script}
          </pre>
        </CollapsibleContent>
      </Collapsible>
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="flex items-center gap-2 text-meta text-chat-fg-muted"
          htmlFor={`script-run-max-agents-${run.id}`}
        >
          {t("scriptRun.maxAgents")}
          <Input
            className="h-7 w-20"
            disabled={busy}
            id={`script-run-max-agents-${run.id}`}
            max={SCRIPT_RUN_HARD_MAX_AGENTS}
            min={1}
            onChange={(event) => setMaxAgents(event.target.value)}
            type="number"
            value={maxAgents}
          />
        </label>
        <span className="flex-1" />
        <Button
          disabled={busy}
          onClick={() => void act(() => desktopApi.cancelScriptRun(run.id))}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("scriptRun.discard")}
        </Button>
        <Button
          disabled={busy}
          onClick={() => void handleRun()}
          size="sm"
          type="button"
        >
          {t("scriptRun.run")}
        </Button>
      </div>
    </section>
  );
}

export function ScriptRunProposals({ sessionId }: { sessionId: string }) {
  const runs = useScriptRuns(sessionId).filter((run) => run.status === "draft");
  if (runs.length === 0) return null;
  return (
    <div className="flex w-full flex-col gap-2 px-2 pb-4">
      {runs.map((run) => (
        <ScriptRunProposalCard key={run.id} run={run} />
      ))}
    </div>
  );
}
