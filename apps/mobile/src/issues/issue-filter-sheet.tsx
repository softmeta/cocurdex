import type { SavedHost } from "@cocurdex/client-runtime";
import { Stack, useRouter } from "expo-router";
import { useTranslation } from "react-i18next";
import { useCurrentHost } from "@/hosts";
import {
  CloseButton,
  Form,
  FormRow,
  FormSection,
  FormText,
  SelectedMark,
  ValueFormRow,
} from "@/ui";
import {
  type IssueFilterOption,
  useIssueFilterOptions,
  useIssueFilterTitles,
} from "./issue-filter-options";
import { setIssueFilters, useIssueFilters } from "./issue-filter-store";
import {
  activeIssueFilterCount,
  EMPTY_ISSUE_FILTERS,
  ISSUE_FILTER_FIELDS,
  type IssueFilterField,
  toggledIssueFilter,
} from "./issue-filters";

function summary(
  options: readonly IssueFilterOption[],
  selected: readonly string[],
  any: string,
) {
  if (selected.length === 0) return any;
  return selected
    .map(
      (value) =>
        options.find((option) => option.value === value)?.label ?? value,
    )
    .join(", ");
}

function Sheet({ host }: { host: SavedHost }) {
  const { t } = useTranslation("issues");
  const router = useRouter();
  const filters = useIssueFilters(host.hostId);
  const options = useIssueFilterOptions(host.hostId);
  const titles = useIssueFilterTitles();
  const count = activeIssueFilterCount(filters);

  return (
    <>
      <CloseButton
        accessibilityLabel={t("filter.close")}
        onPress={() => router.dismiss()}
      />
      <Form>
        <FormSection>
          {ISSUE_FILTER_FIELDS.map((field) => (
            <ValueFormRow
              key={field}
              testID={`issue-filter-${field}`}
              label={titles[field]}
              value={summary(options[field], filters[field], t("filter.any"))}
              onPress={() =>
                router.push({
                  pathname: "/issue-filters/[field]",
                  params: { field },
                })
              }
            />
          ))}
        </FormSection>
        {count > 0 ? (
          <FormSection>
            <FormRow
              testID="issue-filter-clear"
              onPress={() => setIssueFilters(host.hostId, EMPTY_ISSUE_FILTERS)}
            >
              <FormText tone="tint">{t("filter.clear")}</FormText>
            </FormRow>
          </FormSection>
        ) : null}
      </Form>
    </>
  );
}

function Picker({ host, field }: { host: SavedHost; field: IssueFilterField }) {
  const filters = useIssueFilters(host.hostId);
  const options = useIssueFilterOptions(host.hostId)[field];
  const title = useIssueFilterTitles()[field];
  return (
    <>
      <Stack.Screen options={{ title }} />
      <Form>
        <FormSection>
          {options.map((option) => {
            const selected = filters[field].includes(option.value);
            return (
              <FormRow
                key={option.value}
                testID={`issue-filter-choice-${option.value}`}
                selected={selected}
                leading={option.leading}
                trailing={<SelectedMark selected={selected} />}
                onPress={() =>
                  setIssueFilters(
                    host.hostId,
                    toggledIssueFilter(filters, field, option.value),
                  )
                }
              >
                {option.label}
              </FormRow>
            );
          })}
        </FormSection>
      </Form>
    </>
  );
}

export function IssueFilterSheet() {
  const host = useCurrentHost();
  return host ? <Sheet host={host} /> : null;
}

export function IssueFilterPicker({ field }: { field: IssueFilterField }) {
  const host = useCurrentHost();
  return host ? <Picker host={host} field={field} /> : null;
}
