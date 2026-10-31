import type { AgentId } from "@cocurdex/shared";
import { useAtom, useSetAtom } from "jotai";
import {
  Archive,
  ArrowDownUp,
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  Bot,
  CheckCheck,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleDot,
  Clock,
  Cpu,
  Eye,
  Folder,
  GitBranch,
  Inbox,
  LayoutList,
  List,
  ListChecks,
  type LucideIcon,
  Minimize2,
  Monitor,
  Sparkles,
  SquareDashed,
  UserRound,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { AppDropdownRadioList } from "@/components";
import {
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui";
import { AgentIcon, getAgentDisplayLabel } from "@/features/sessions";
import {
  countActiveSessionFilters,
  defaultOrderDirection,
  SESSION_ENVIRONMENTS,
  SESSION_GROUPINGS,
  SESSION_ORDER_DIRECTIONS,
  SESSION_ORDERINGS,
  SESSION_PROPERTIES,
  SESSION_ROOT_LIMITS,
  SESSION_SOURCES,
  SESSION_STATUS_BUCKETS,
  type SessionGrouping,
  type SessionListView,
  type SessionOrderDirection,
  type SessionProperty,
  sessionListViewAtom,
} from "@/features/sessions/session-list-view";
import { openSettings } from "@/features/settings";
import { resetAllSessionRootLimitsAtom } from "./session-list-expansion-store";
import { useSessionListViewLabels } from "./use-session-list-view-labels";

const GROUPING_ICONS: Record<SessionGrouping, LucideIcon> = {
  workspace: Folder,
  status: SquareDashed,
  updated: Clock,
  agent: Sparkles,
  none: List,
};

const DIRECTION_ICONS: Record<SessionOrderDirection, LucideIcon> = {
  asc: ArrowUpNarrowWide,
  desc: ArrowDownWideNarrow,
};

function DirectionIcon({ direction }: { direction: SessionOrderDirection }) {
  const Icon = DIRECTION_ICONS[direction];
  return <Icon />;
}

const PROPERTY_ICONS: Record<SessionProperty, LucideIcon> = {
  timestamp: Clock,
  agent: Sparkles,
  model: Cpu,
  role: UserRound,
  workspace: Folder,
  worktree: GitBranch,
};

type MultiFilterKey = "statuses" | "agents" | "environments" | "sources";

function toggleValue<T>(values: readonly T[], value: T, checked: boolean) {
  return checked
    ? [...values.filter((item) => item !== value), value]
    : values.filter((item) => item !== value);
}

function FilterSubmenu<T extends string>({
  filterKey,
  icon: Icon,
  label,
  options,
  view,
  onChange,
}: {
  filterKey: MultiFilterKey;
  icon: LucideIcon;
  label: string;
  options: readonly { value: T; label: string; icon?: React.ReactNode }[];
  view: SessionListView;
  onChange(update: Partial<SessionListView>): void;
}) {
  const selected = view[filterKey] as readonly string[];

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Icon />
        <span className="flex-1 truncate">{label}</span>
        {selected.length > 0 ? (
          <span className="text-muted-foreground tabular-nums">
            {selected.length}
          </span>
        ) : null}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="max-h-80 min-w-40 overflow-y-auto">
        {options.map((option) => (
          <DropdownMenuCheckboxItem
            checked={selected.includes(option.value)}
            key={option.value}
            onCheckedChange={(checked) =>
              onChange({
                [filterKey]: toggleValue(selected, option.value, checked),
              })
            }
          >
            {option.icon}
            <span className="min-w-0 flex-1 truncate">{option.label}</span>
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export interface SessionListViewMenuContentProps {
  agentIds: readonly AgentId[];
  allCollapsed: boolean;
  unreadCount: number;
  onMarkAllRead(): void;
  onToggleCollapseAll(): void;
}

export function SessionListViewMenuContent({
  agentIds,
  allCollapsed,
  unreadCount,
  onMarkAllRead,
  onToggleCollapseAll,
}: SessionListViewMenuContentProps) {
  const { t } = useTranslation("sessions");
  const labels = useSessionListViewLabels();
  const [view, setView] = useAtom(sessionListViewAtom);
  const resetAllSessionRootLimits = useSetAtom(resetAllSessionRootLimitsAtom);
  const filterCount = countActiveSessionFilters(view);

  return (
    <DropdownMenuContent align="start" className="min-w-52">
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <LayoutList />
          <span className="flex-1 truncate">
            {t("sidebar.view.groupingLabel")}
          </span>
          <span className="text-muted-foreground">
            {labels.grouping[view.grouping]}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-40">
          <AppDropdownRadioList
            onValueChange={(value) =>
              setView({ grouping: value as SessionGrouping })
            }
            options={SESSION_GROUPINGS.map((grouping) => {
              const Icon = GROUPING_ICONS[grouping];
              return {
                value: grouping,
                label: labels.grouping[grouping],
                icon: <Icon />,
              };
            })}
            value={view.grouping}
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <ArrowDownUp />
          <span className="flex-1 truncate">
            {t("sidebar.view.orderingLabel")}
          </span>
          <span className="text-muted-foreground">
            {labels.ordering[view.ordering]}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-40">
          <AppDropdownRadioList
            onValueChange={(value) => {
              const ordering = value as SessionListView["ordering"];
              setView({
                ordering,
                direction: defaultOrderDirection(ordering),
              });
            }}
            options={SESSION_ORDERINGS.map((ordering) => ({
              value: ordering,
              label: labels.ordering[ordering],
            }))}
            value={view.ordering}
          />
          <DropdownMenuSeparator />
          <AppDropdownRadioList
            onValueChange={(value) =>
              setView({ direction: value as SessionListView["direction"] })
            }
            options={SESSION_ORDER_DIRECTIONS.map((direction) => ({
              value: direction,
              label: labels.direction[direction],
              icon: <DirectionIcon direction={direction} />,
            }))}
            value={view.direction}
          />
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Eye />
          <span className="flex-1 truncate">{t("sidebar.view.showLabel")}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-44">
          <DropdownMenuGroup>
            <DropdownMenuLabel>
              {t("sidebar.view.rootLimitLabel")}
            </DropdownMenuLabel>
            <AppDropdownRadioList
              onValueChange={(value) => {
                resetAllSessionRootLimits();
                setView({
                  rootLimit: value as SessionListView["rootLimit"],
                });
              }}
              options={SESSION_ROOT_LIMITS.map((rootLimit) => ({
                value: rootLimit,
                label: labels.rootLimit[rootLimit],
              }))}
              value={view.rootLimit}
            />
          </DropdownMenuGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <ListChecks />
          <span className="flex-1 truncate">
            {t("sidebar.view.propertiesLabel")}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {view.properties.length}
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-40">
          {SESSION_PROPERTIES.map((property) => {
            const Icon = PROPERTY_ICONS[property];
            return (
              <DropdownMenuCheckboxItem
                checked={view.properties.includes(property)}
                key={property}
                onCheckedChange={(checked) =>
                  setView({
                    compact: false,
                    properties: SESSION_PROPERTIES.filter((item) =>
                      item === property
                        ? checked
                        : view.properties.includes(item),
                    ),
                  })
                }
              >
                <Icon />
                <span className="min-w-0 flex-1 truncate">
                  {labels.property[property]}
                </span>
              </DropdownMenuCheckboxItem>
            );
          })}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuCheckboxItem
        checked={view.compact}
        onCheckedChange={(checked) => setView({ compact: checked })}
      >
        <Minimize2 />
        <span className="min-w-0 flex-1 truncate">
          {t("sidebar.view.compact")}
        </span>
      </DropdownMenuCheckboxItem>
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        <DropdownMenuLabel>{t("sidebar.view.filtersLabel")}</DropdownMenuLabel>
        <FilterSubmenu
          filterKey="statuses"
          icon={CircleDot}
          label={t("sidebar.view.statusFilter")}
          onChange={setView}
          options={SESSION_STATUS_BUCKETS.map((status) => ({
            value: status,
            label: labels.status[status],
          }))}
          view={view}
        />
        <FilterSubmenu
          filterKey="agents"
          icon={Bot}
          label={t("sidebar.view.agentFilter")}
          onChange={setView}
          options={agentIds.map((agentId) => ({
            value: agentId,
            label: getAgentDisplayLabel(agentId),
            icon: <AgentIcon agentId={agentId} className="size-3.5" />,
          }))}
          view={view}
        />
        <FilterSubmenu
          filterKey="environments"
          icon={Monitor}
          label={t("sidebar.view.environmentFilter")}
          onChange={setView}
          options={SESSION_ENVIRONMENTS.map((environment) => ({
            value: environment,
            label: labels.environment[environment],
          }))}
          view={view}
        />
        <FilterSubmenu
          filterKey="sources"
          icon={Inbox}
          label={t("sidebar.view.sourceFilter")}
          onChange={setView}
          options={SESSION_SOURCES.map((source) => ({
            value: source,
            label: labels.source[source],
          }))}
          view={view}
        />
        {filterCount > 0 ? (
          <DropdownMenuItem
            onClick={() =>
              setView({
                statuses: [],
                agents: [],
                environments: [],
                sources: [],
              })
            }
          >
            <X />
            {t("sidebar.view.clearFilters", { count: filterCount })}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onClick={() => openSettings("archived")}>
          <Archive />
          {t("sidebar.view.archived")}
        </DropdownMenuItem>
      </DropdownMenuGroup>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        disabled={view.grouping === "none"}
        onClick={onToggleCollapseAll}
      >
        {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
        {allCollapsed
          ? t("sidebar.view.expandAll")
          : t("sidebar.view.collapseAll")}
      </DropdownMenuItem>
      <DropdownMenuItem disabled={unreadCount === 0} onClick={onMarkAllRead}>
        <CheckCheck />
        {t("sidebar.view.markAllRead")}
      </DropdownMenuItem>
    </DropdownMenuContent>
  );
}
