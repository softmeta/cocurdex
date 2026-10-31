import type { SavedHost } from "@cocurdex/client-runtime";
import {
  defaultOrderDirection,
  SESSION_ENVIRONMENTS,
  SESSION_GROUPINGS,
  SESSION_ORDER_DIRECTIONS,
  SESSION_ORDERINGS,
  SESSION_ROOT_LIMITS,
  SESSION_STATUS_BUCKETS,
  type SessionListView,
} from "@cocurdex/shared";
import { Stack, useRouter } from "expo-router";
import type { ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AgentIcon } from "@/agents";
import { useCurrentHost } from "@/hosts";
import {
  updateSessionListView,
  useSessionListLabels,
  useSessionListUi,
} from "@/sessions";
import { Form, FormRow, FormSection, SelectedMark } from "@/ui";
import { type ListOptionField, toggledValue } from "./list-option-fields";
import { useSessionAgentChoices } from "./session-agents";

interface Option {
  key: string;
  label: string;
  leading?: ReactElement;
  selected: boolean;
  onPress(): void;
}

function OptionSection({
  title,
  options,
}: {
  title?: string;
  options: readonly Option[];
}) {
  return (
    <FormSection title={title}>
      {options.map((option) => (
        <FormRow
          key={option.key}
          testID={`list-choice-${option.key}`}
          selected={option.selected}
          onPress={option.onPress}
          leading={option.leading}
          trailing={<SelectedMark selected={option.selected} />}
        >
          {option.label}
        </FormRow>
      ))}
    </FormSection>
  );
}

function useFieldSections(
  hostId: string,
  field: ListOptionField,
  view: SessionListView,
  pick: (update: Partial<SessionListView>) => void,
): { title: string; sections: ReactNode } {
  const { t } = useTranslation("sessions");
  const labels = useSessionListLabels();
  const agents = useSessionAgentChoices(hostId);
  switch (field) {
    case "grouping":
      return {
        title: t("list.groupingLabel"),
        sections: (
          <OptionSection
            options={SESSION_GROUPINGS.map((grouping) => ({
              key: grouping,
              label: labels.grouping[grouping],
              selected: view.grouping === grouping,
              onPress: () => pick({ grouping }),
            }))}
          />
        ),
      };
    case "ordering":
      return {
        title: t("list.orderingLabel"),
        sections: (
          <>
            <OptionSection
              options={SESSION_ORDERINGS.map((ordering) => ({
                key: ordering,
                label: labels.ordering[ordering],
                selected: view.ordering === ordering,
                onPress: () =>
                  updateSessionListView({
                    ordering,
                    direction: defaultOrderDirection(ordering),
                  }),
              }))}
            />
            <OptionSection
              options={SESSION_ORDER_DIRECTIONS.map((direction) => ({
                key: direction,
                label: labels.direction[direction],
                selected: view.direction === direction,
                onPress: () => updateSessionListView({ direction }),
              }))}
            />
          </>
        ),
      };
    case "rootLimit":
      return {
        title: t("list.rootLimitLabel"),
        sections: (
          <OptionSection
            options={SESSION_ROOT_LIMITS.map((rootLimit) => ({
              key: `limit-${rootLimit}`,
              label: labels.rootLimit(rootLimit),
              selected: view.rootLimit === rootLimit,
              onPress: () => pick({ rootLimit }),
            }))}
          />
        ),
      };
    case "statuses":
      return {
        title: t("list.statusFilter"),
        sections: (
          <OptionSection
            options={SESSION_STATUS_BUCKETS.map((status) => ({
              key: status,
              label: labels.status[status],
              selected: view.statuses.includes(status),
              onPress: () =>
                updateSessionListView({
                  statuses: toggledValue(view.statuses, status),
                }),
            }))}
          />
        ),
      };
    case "agents":
      return {
        title: t("list.agentFilter"),
        sections: (
          <OptionSection
            options={agents.map((agent) => ({
              key: agent.id,
              label: agent.label,
              leading: <AgentIcon agentId={agent.id} size={20} />,
              selected: view.agents.includes(agent.id),
              onPress: () =>
                updateSessionListView({
                  agents: toggledValue(view.agents, agent.id),
                }),
            }))}
          />
        ),
      };
    case "environments":
      return {
        title: t("list.environmentFilter"),
        sections: (
          <OptionSection
            options={SESSION_ENVIRONMENTS.map((environment) => ({
              key: environment,
              label: labels.environment[environment],
              selected: view.environments.includes(environment),
              onPress: () =>
                updateSessionListView({
                  environments: toggledValue(view.environments, environment),
                }),
            }))}
          />
        ),
      };
  }
}

function Picker({ host, field }: { host: SavedHost; field: ListOptionField }) {
  const router = useRouter();
  const { view } = useSessionListUi();
  const pick = (update: Partial<SessionListView>) => {
    updateSessionListView(update);
    router.back();
  };
  const { title, sections } = useFieldSections(host.hostId, field, view, pick);
  return (
    <>
      <Stack.Screen options={{ title }} />
      <Form adjustsForKeyboard>{sections}</Form>
    </>
  );
}

export function ListOptionPicker({ field }: { field: ListOptionField }) {
  const host = useCurrentHost();
  return host ? <Picker host={host} field={field} /> : null;
}
