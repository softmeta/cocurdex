import {
  ACP_REGISTRY_AGENT_ID_PREFIX,
  type AcpRegistryAgentId,
  type AcpRegistryCatalogAgent,
  isAcpRegistryAgentId,
  toAcpRegistryAgentId,
} from "@cocurdex/shared";
import { useAtomValue, useSetAtom } from "jotai";
import { Check, Download, PackageSearch, Terminal, Trash2 } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Spinner,
  Text,
} from "@/components/ui";
import {
  AgentIcon,
  agentsAtom,
  bootstrapAgentsAtom,
} from "@/features/sessions";
import { desktopApi, useMountEffect } from "@/lib";
import { AcpRegistryInstallPanel } from "./acp-registry-install-panel";

export interface AcpRegistryDialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

function matchesQuery(agent: AcpRegistryCatalogAgent, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [agent.name, agent.registryId, agent.description ?? ""].some((text) =>
    text.toLowerCase().includes(needle),
  );
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function RegistryAgentRow({
  agent,
  expanded,
  installed,
  installing,
  onInstall,
  onToggle,
  onUseCommand,
}: {
  agent: AcpRegistryCatalogAgent;
  expanded: boolean;
  installed: boolean;
  installing: boolean;
  onInstall(): void;
  onToggle(): void;
  onUseCommand(command: string, args: string[]): void;
}) {
  const { t } = useTranslation("settings");
  let action = (
    <Button
      aria-expanded={expanded}
      onClick={onToggle}
      size="xs"
      type="button"
      variant="outline"
    >
      <Download className="size-3.5" />
      {t("adapters.registry.install")}
    </Button>
  );
  if (agent.builtInAgentId) {
    action = (
      <Text size="meta" tone="muted">
        {t("adapters.registry.builtIn")}
      </Text>
    );
  } else if (installed) {
    action = (
      <Text className="flex items-center gap-1" size="meta" tone="muted">
        <Check className="size-3.5" />
        {t("adapters.registry.installed")}
      </Text>
    );
  } else if (!agent.installPlan) {
    action = (
      <Button
        aria-expanded={expanded}
        onClick={onToggle}
        size="xs"
        title={t("adapters.registry.unsupported")}
        type="button"
        variant="outline"
      >
        <Terminal className="size-3.5" />
        {t("adapters.registry.manual.open")}
      </Button>
    );
  }
  const canInstall = !agent.builtInAgentId && !installed;

  return (
    <div className="py-3">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <AgentIcon agentId={toAcpRegistryAgentId(agent.registryId)} />
            <Text className="font-medium" size="body">
              {agent.name}
            </Text>
            <Text className="font-mono" size="meta" tone="muted">
              v{agent.version}
            </Text>
            {agent.distribution ? (
              <Badge variant="secondary">{agent.distribution}</Badge>
            ) : null}
          </div>
          {agent.description ? (
            <Text className="mt-0.5 line-clamp-2" size="meta" tone="muted">
              {agent.description}
            </Text>
          ) : null}
        </div>
        <div className="shrink-0">{action}</div>
      </div>
      {expanded && canInstall ? (
        <AcpRegistryInstallPanel
          agent={agent}
          busy={installing}
          onCancel={onToggle}
          onInstall={onInstall}
          onUseCommand={onUseCommand}
        />
      ) : null}
    </div>
  );
}

export function AcpRegistryDialog({
  open,
  onOpenChange,
}: AcpRegistryDialogProps) {
  if (!open) {
    return null;
  }
  return <AcpRegistryCatalog onOpenChange={onOpenChange} />;
}

function AcpRegistryCatalog({
  onOpenChange,
}: Pick<AcpRegistryDialogProps, "onOpenChange">) {
  const { t } = useTranslation("settings");
  const agents = useAtomValue(agentsAtom);
  const bootstrapAgents = useSetAtom(bootstrapAgentsAtom);
  const installedRegistryIds = new Set(
    agents
      .map((agent) => agent.id)
      .filter(isAcpRegistryAgentId)
      .map((agentId) => agentId.slice(ACP_REGISTRY_AGENT_ID_PREFIX.length)),
  );
  const [catalog, setCatalog] = useState<AcpRegistryCatalogAgent[] | null>(
    null,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadCatalog = async () => {
    setLoadError(null);
    try {
      setCatalog(await desktopApi.listAcpRegistryCatalog());
    } catch (error) {
      setLoadError(errorMessage(error, t("adapters.registry.loadFailed")));
    }
  };

  useMountEffect(() => {
    void loadCatalog();
  });

  const install = async (
    agent: AcpRegistryCatalogAgent,
    run: () => Promise<unknown>,
  ) => {
    setInstallingId(agent.registryId);
    try {
      await run();
      bootstrapAgents(await desktopApi.listAgents());
      setExpandedId(null);
      toast.success(
        t("adapters.registry.installSucceeded", { name: agent.name }),
      );
    } catch (error) {
      toast.error(errorMessage(error, t("adapters.registry.installFailed")));
    } finally {
      setInstallingId(null);
    }
  };

  const visibleAgents = (catalog ?? []).filter((agent) =>
    matchesQuery(agent, query),
  );
  let body = (
    <div className="flex h-full items-center justify-center">
      <Spinner size="sm" />
    </div>
  );
  if (loadError) {
    body = (
      <EmptyState
        className="h-full"
        action={
          <Button
            onClick={() => void loadCatalog()}
            size="xs"
            type="button"
            variant="outline"
          >
            {t("adapters.registry.retry")}
          </Button>
        }
        description={loadError}
        title={t("adapters.registry.loadFailed")}
      />
    );
  } else if (catalog && visibleAgents.length === 0) {
    body = (
      <EmptyState
        className="h-full"
        icon={<PackageSearch />}
        title={t("adapters.registry.noResults")}
      />
    );
  } else if (catalog) {
    body = (
      <div className="flex flex-col divide-y divide-border/60">
        {visibleAgents.map((agent) => (
          <RegistryAgentRow
            agent={agent}
            expanded={expandedId === agent.registryId}
            installed={installedRegistryIds.has(agent.registryId)}
            installing={installingId === agent.registryId}
            key={agent.registryId}
            onInstall={() =>
              void install(agent, () =>
                desktopApi.installAcpRegistryAgent(agent.registryId),
              )
            }
            onToggle={() =>
              setExpandedId((current) =>
                current === agent.registryId ? null : agent.registryId,
              )
            }
            onUseCommand={(command, args) =>
              void install(agent, () =>
                desktopApi.installAcpRegistryCommand({
                  registryId: agent.registryId,
                  command,
                  args,
                }),
              )
            }
          />
        ))}
      </div>
    );
  }

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent size="palette">
        <DialogHeader>
          <DialogTitle>{t("adapters.registry.title")}</DialogTitle>
          <DialogDescription>
            {t("adapters.registry.description")}
          </DialogDescription>
        </DialogHeader>
        <Input
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("adapters.registry.search")}
          value={query}
        />
        <div className="h-[60vh] overflow-y-auto px-1">{body}</div>
      </DialogContent>
    </Dialog>
  );
}

export function AcpRegistryRemoveButton({
  agentId,
  label,
  onRemoved,
}: {
  agentId: AcpRegistryAgentId;
  label: string;
  onRemoved(): Promise<void>;
}) {
  const { t } = useTranslation("settings");
  const [removing, setRemoving] = useState(false);

  const remove = async () => {
    setRemoving(true);
    try {
      await desktopApi.uninstallAcpRegistryAgent(agentId);
      await onRemoved();
      toast.success(t("adapters.registry.removeSucceeded", { name: label }));
    } catch (error) {
      toast.error(errorMessage(error, t("adapters.registry.removeFailed")));
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Button
      disabled={removing}
      onClick={() => void remove()}
      size="xs"
      type="button"
      variant="ghost"
    >
      {removing ? <Spinner size="xs" /> : <Trash2 className="size-3.5" />}
      {t("adapters.registry.remove")}
    </Button>
  );
}
