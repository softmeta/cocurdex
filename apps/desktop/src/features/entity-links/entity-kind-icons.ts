import type { LinkableEntityKind } from "@cocurdex/shared";
import {
  Bot,
  CircleDot,
  FileText,
  type LucideIcon,
  Presentation,
} from "lucide-react";

export const ENTITY_KIND_ICONS: Record<LinkableEntityKind, LucideIcon> = {
  session: Bot,
  note: FileText,
  issue: CircleDot,
  deck: Presentation,
};
