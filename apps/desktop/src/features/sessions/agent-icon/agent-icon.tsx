import {
  ACP_REGISTRY_AGENT_ID_PREFIX,
  type AgentId,
  isAcpRegistryAgentId,
} from "@cocurdex/shared";
import { Bot } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib";
import { builtInAgentIcons, registryAgentIcons } from "./agent-brand-icons";

const ACP_REGISTRY_ICON_BASE_URL =
  "https://cdn.agentclientprotocol.com/registry/v1/latest/";

export function AgentIcon({
  agentId,
  className,
}: {
  agentId: AgentId;
  className?: string;
}) {
  if (isAcpRegistryAgentId(agentId)) {
    const registryId = agentId.slice(ACP_REGISTRY_AGENT_ID_PREFIX.length);
    const BrandIcon = registryAgentIcons[registryId];
    if (BrandIcon) {
      return <BrandIcon className={cn("size-4 shrink-0", className)} />;
    }
    return <RegistryAgentIcon className={className} registryId={registryId} />;
  }
  const Icon = builtInAgentIcons[agentId];
  if (!Icon) {
    return (
      <Bot
        aria-hidden
        className={cn("size-4 shrink-0 text-muted-foreground", className)}
      />
    );
  }
  return <Icon className={cn("size-4 shrink-0", className)} />;
}

function RegistryAgentIcon({
  className,
  registryId,
}: {
  className?: string;
  registryId: string;
}) {
  const src = `${ACP_REGISTRY_ICON_BASE_URL}${encodeURIComponent(registryId)}.svg`;
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (failedSrc === src) {
    return (
      <Bot
        aria-hidden
        className={cn("size-4 shrink-0 text-muted-foreground", className)}
      />
    );
  }
  return (
    <img
      alt=""
      aria-hidden
      className={cn("size-4 shrink-0 object-contain dark:invert", className)}
      decoding="async"
      draggable={false}
      referrerPolicy="no-referrer"
      src={src}
      onError={() => setFailedSrc(src)}
    />
  );
}
