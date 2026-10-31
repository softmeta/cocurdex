import {
  ACP_REGISTRY_AGENT_ID_PREFIX,
  type AgentId,
  BUILT_IN_AGENT_BRAND_ICONS,
  type BuiltInAgentId,
  isAcpRegistryAgentId,
  REGISTRY_AGENT_BRAND_ICONS,
} from "@cocurdex/shared";
import { useThemeColors } from "@/theme";
import { brandIconXml, fallbackIconXml, tintedIconXml } from "./agent-icon-xml";
import { useRegistryIcon } from "./registry-icons";
import { SvgIcon } from "./svg-icon";

function registryIdOf(agentId: AgentId) {
  return isAcpRegistryAgentId(agentId)
    ? agentId.slice(ACP_REGISTRY_AGENT_ID_PREFIX.length)
    : null;
}

export function AgentIcon({
  agentId,
  size = 14,
  color,
}: {
  agentId: AgentId;
  size?: number;
  color?: string;
}) {
  const colors = useThemeColors();
  const tint = color ?? colors.foreground;
  const registryId = registryIdOf(agentId);
  const brand = registryId
    ? REGISTRY_AGENT_BRAND_ICONS[registryId]
    : BUILT_IN_AGENT_BRAND_ICONS[agentId as BuiltInAgentId];
  const remote = useRegistryIcon(brand ? null : registryId);
  let xml = fallbackIconXml(colors.mutedForeground);
  if (brand) xml = brandIconXml(brand, tint);
  else if (remote) xml = tintedIconXml(remote, tint);
  return <SvgIcon xml={xml} size={size} />;
}
