import {
  type AgentBrandIcon as AgentBrandIconGeometry,
  BUILT_IN_AGENT_BRAND_ICONS,
  type BuiltInAgentId,
  REGISTRY_AGENT_BRAND_ICONS,
} from "@cocurdex/shared";
import type { FC, SVGProps } from "react";
import { cn } from "@/lib";

type BrandIcon = FC<SVGProps<SVGSVGElement>>;

function brandIcon({ viewBox, color, paths }: AgentBrandIconGeometry) {
  const Icon: BrandIcon = ({ className, ...props }) => (
    <svg
      {...props}
      aria-hidden="true"
      viewBox={viewBox}
      fill={color ?? "currentColor"}
      className={cn("shrink-0", className)}
    >
      {paths.map((path) => (
        <path
          key={path.d}
          d={path.d}
          fillRule={path.evenOdd ? "evenodd" : undefined}
          clipRule={path.evenOdd ? "evenodd" : undefined}
          opacity={path.opacity}
        />
      ))}
    </svg>
  );
  return Icon;
}

function brandIcons<Key extends string>(
  geometry: Readonly<Record<Key, AgentBrandIconGeometry>>,
) {
  return Object.fromEntries(
    Object.entries<AgentBrandIconGeometry>(geometry).map(([id, icon]) => [
      id,
      brandIcon(icon),
    ]),
  ) as Record<Key, BrandIcon>;
}

export const builtInAgentIcons: Record<BuiltInAgentId, BrandIcon> = brandIcons(
  BUILT_IN_AGENT_BRAND_ICONS,
);

export const registryAgentIcons: Readonly<Record<string, BrandIcon>> =
  brandIcons(REGISTRY_AGENT_BRAND_ICONS);
