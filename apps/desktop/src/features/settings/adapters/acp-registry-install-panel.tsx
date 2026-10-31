import type {
  AcpRegistryCatalogAgent,
  AcpRegistryInstallPlan,
  AcpRegistryLaunchCommand,
} from "@cocurdex/shared";
import { Copy, ExternalLink, TriangleAlert } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button, Input, Label, Spinner, Text } from "@/components/ui";
import { desktopApi } from "@/lib";

function quoteArg(value: string) {
  return /[\s"']/.test(value) ? JSON.stringify(value) : value;
}

function formatLaunch({ command, args, env }: AcpRegistryLaunchCommand) {
  const assignments = Object.entries(env).map(
    ([key, value]) => `${key}=${quoteArg(value)}`,
  );
  return [...assignments, command, ...args].map(quoteArg).join(" ");
}

function commandBaseName(command: string) {
  return command.split(/[\\/]/).at(-1) ?? command;
}

function splitArgs(value: string) {
  return value.split(/\s+/).filter(Boolean);
}

function PlanRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Text size="meta" tone="muted">
        {label}
      </Text>
      {children}
    </div>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return (
    <Text className="break-all font-mono" size="meta">
      {children}
    </Text>
  );
}

function CommandRow({
  command,
  label,
}: {
  command: AcpRegistryLaunchCommand;
  label: string;
}) {
  const { t } = useTranslation("settings");
  const text = formatLaunch(command);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    toast.success(t("adapters.registry.plan.copied"));
  };

  return (
    <PlanRow label={label}>
      <div className="flex items-start gap-2">
        <Mono>{text}</Mono>
        <Button
          aria-label={t("adapters.registry.plan.copy")}
          className="shrink-0"
          onClick={() => void copy()}
          size="icon-xs"
          title={t("adapters.registry.plan.copy")}
          type="button"
          variant="ghost"
        >
          <Copy className="size-3.5" />
        </Button>
      </div>
    </PlanRow>
  );
}

function PlanSummary({ plan }: { plan: AcpRegistryInstallPlan }) {
  const { t } = useTranslation("settings");

  let note: ReactNode = null;
  if (plan.download) {
    note = (
      <>
        <PlanRow label={t("adapters.registry.plan.download")}>
          <Mono>{plan.download.url}</Mono>
        </PlanRow>
        <PlanRow label="SHA-256">
          {plan.download.sha256 ? (
            <Mono>{plan.download.sha256}</Mono>
          ) : (
            <Text
              className="flex items-center gap-1"
              size="meta"
              tone="destructive"
            >
              <TriangleAlert className="size-3.5 shrink-0" />
              {t("adapters.registry.plan.noChecksum")}
            </Text>
          )}
        </PlanRow>
        <PlanRow label={t("adapters.registry.plan.directory")}>
          <Mono>{plan.download.directory}</Mono>
        </PlanRow>
      </>
    );
  } else if (plan.prefetch) {
    note = (
      <>
        <Text size="meta" tone="muted">
          {t("adapters.registry.plan.packageNote", {
            runner: plan.prefetch.command,
          })}
        </Text>
        <CommandRow
          command={plan.prefetch}
          label={t("adapters.registry.plan.prefetch")}
        />
      </>
    );
  } else {
    note = (
      <Text size="meta" tone="muted">
        {t("adapters.registry.plan.localNote")}
      </Text>
    );
  }

  return (
    <>
      {note}
      <CommandRow
        command={plan.launch}
        label={t("adapters.registry.plan.launch")}
      />
    </>
  );
}

function ManualCommandForm({
  busy,
  initialCommand,
  initialArgs,
  onBack,
  onSubmit,
}: {
  busy: boolean;
  initialCommand: string;
  initialArgs: string;
  onBack(): void;
  onSubmit(command: string, args: string[]): void;
}) {
  const { t } = useTranslation("settings");
  const [command, setCommand] = useState(initialCommand);
  const [args, setArgs] = useState(initialArgs);

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(command.trim(), splitArgs(args));
      }}
    >
      <Text size="meta" tone="muted">
        {t("adapters.registry.manual.description")}
      </Text>
      <Label className="flex flex-col items-start gap-1">
        <Text size="meta">{t("adapters.registry.manual.command")}</Text>
        <Input
          className="font-mono"
          onChange={(event) => setCommand(event.target.value)}
          placeholder="/usr/local/bin/agent"
          value={command}
        />
      </Label>
      <Label className="flex flex-col items-start gap-1">
        <Text size="meta">{t("adapters.registry.manual.args")}</Text>
        <Input
          className="font-mono"
          onChange={(event) => setArgs(event.target.value)}
          placeholder="acp"
          value={args}
        />
      </Label>
      <div className="flex justify-end gap-2">
        <Button onClick={onBack} size="xs" type="button" variant="ghost">
          {t("adapters.registry.manual.back")}
        </Button>
        <Button disabled={busy || !command.trim()} size="xs" type="submit">
          {busy ? <Spinner size="xs" /> : null}
          {t("adapters.registry.manual.save")}
        </Button>
      </div>
    </form>
  );
}

export function AcpRegistryInstallPanel({
  agent,
  busy,
  onCancel,
  onInstall,
  onUseCommand,
}: {
  agent: AcpRegistryCatalogAgent;
  busy: boolean;
  onCancel(): void;
  onInstall(): void;
  onUseCommand(command: string, args: string[]): void;
}) {
  const { t } = useTranslation("settings");
  const [manual, setManual] = useState(!agent.installPlan);
  const plan = agent.installPlan;
  const links = [agent.repository, agent.website].filter((url): url is string =>
    Boolean(url),
  );

  return (
    <div className="mt-2 flex flex-col gap-2.5 rounded-control bg-muted/50 p-3">
      {plan ? <PlanSummary plan={plan} /> : null}
      {links.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {links.map((url) => (
            <Button
              key={url}
              onClick={() => void desktopApi.openExternal(url)}
              size="xs"
              type="button"
              variant="ghost"
            >
              <ExternalLink className="size-3.5" />
              {new URL(url).host}
            </Button>
          ))}
        </div>
      ) : null}
      {manual ? (
        <ManualCommandForm
          busy={busy}
          initialArgs={plan?.launch.args.join(" ") ?? ""}
          initialCommand={plan ? commandBaseName(plan.launch.command) : ""}
          onBack={plan ? () => setManual(false) : onCancel}
          onSubmit={onUseCommand}
        />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <Button
            onClick={() => setManual(true)}
            size="xs"
            type="button"
            variant="ghost"
          >
            {t("adapters.registry.manual.open")}
          </Button>
          <div className="flex gap-2">
            <Button onClick={onCancel} size="xs" type="button" variant="ghost">
              {t("adapters.registry.plan.cancel")}
            </Button>
            <Button disabled={busy} onClick={onInstall} size="xs" type="button">
              {busy ? <Spinner size="xs" /> : null}
              {t("adapters.registry.plan.confirm")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
