import type { ViewFull } from "@cocurdex/shared";
import { SymbolView } from "expo-symbols";
import { type ReactElement, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  type HostInstance,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
} from "react-native";
import { useHostSessions } from "@/sessions";
import { layout, space, useThemeColors } from "@/theme";
import { measureAnchor, useAnchoredMenu, useOptionSheet } from "@/ui";
import { IssuePriorityMark } from "./issue-priority-mark";
import { IssueStatusMark } from "./issue-status-mark";

export const NO_WORKSPACE = "";

export type IssueField = "workspace" | "status" | "priority";

export type IssueFieldValues = Record<IssueField, string | null>;

const UNSET_VALUES: IssueFieldValues = {
  status: null,
  priority: "none",
  workspace: NO_WORKSPACE,
};

const BAR_FIELDS: readonly IssueField[] = ["status", "priority"];
const MENU_LIMIT = 6;

interface Choice {
  value: string;
  label: string;
}

type FieldOptions = Pick<ViewFull, "statusOptions" | "priorityOptions">;

export function useIssueFieldChips({
  hostId,
  options,
  values,
  testIDPrefix,
  enabled,
  beforePick,
  onChange,
}: {
  hostId: string;
  options: FieldOptions | undefined;
  values: IssueFieldValues;
  testIDPrefix: string;
  enabled: boolean;
  beforePick(): Promise<void>;
  onChange(field: IssueField, value: string): void;
}) {
  const { t } = useTranslation("issues");
  const colors = useThemeColors();
  const menu = useAnchoredMenu(`${testIDPrefix}-menu`);
  const openSheet = useOptionSheet();
  const { workspaces } = useHostSessions(hostId);

  const choices: Record<IssueField, Choice[]> = {
    workspace: [
      { value: NO_WORKSPACE, label: t("field.none") },
      ...workspaces.map((workspace) => ({
        value: workspace.id,
        label: workspace.name,
      })),
    ],
    status: (options?.statusOptions ?? []).map((option) => ({
      value: option.id,
      label: option.title,
    })),
    priority: (options?.priorityOptions ?? []).map((option) => ({
      value: option.id,
      label: option.title,
    })),
  };
  const titles: Record<IssueField, string> = {
    workspace: t("field.workspace"),
    status: t("field.status"),
    priority: t("field.priority"),
  };
  const labelOf = (field: IssueField) =>
    choices[field].find((choice) => choice.value === values[field])?.label ??
    t("field.none");

  const markOf = (field: IssueField, value: string | null, label: string) => {
    if (field === "status") {
      const option = options?.statusOptions.find((entry) => entry.id === value);
      return (
        <IssueStatusMark category={option?.category ?? null} label={label} />
      );
    }
    if (field === "priority" && value) {
      return <IssuePriorityMark priority={value} label={label} />;
    }
    return undefined;
  };

  const choiceItems = (field: IssueField) =>
    choices[field].map((choice) => ({
      key: choice.value,
      label: choice.label,
      leading: markOf(field, choice.value, choice.label),
      selected: choice.value === values[field],
      testID: `${testIDPrefix}-choice-${choice.value || "none"}`,
      onPress: () => onChange(field, choice.value),
    }));

  const pick = async (field: IssueField, chip: HostInstance | null) => {
    await beforePick();
    const request = { title: titles[field], items: choiceItems(field) };
    if (choices[field].length > MENU_LIMIT) return openSheet(request);
    measureAnchor(chip, (anchor) => menu.open(anchor, request));
  };

  const chipMarkOf = (field: IssueField) =>
    field === "workspace" ? (
      <SymbolView
        name={{ ios: "folder", android: "folder" }}
        size={16}
        tintColor={colors.mutedForeground}
      />
    ) : (
      markOf(field, values[field], labelOf(field))
    );

  const chip = (field: IssueField) => {
    const unset = UNSET_VALUES[field] === values[field];
    return (
      <PropertyChip
        key={field}
        testID={`${testIDPrefix}-${field}`}
        label={unset ? titles[field] : labelOf(field)}
        unset={unset}
        disabled={!enabled}
        accessibilityLabel={`${titles[field]}, ${labelOf(field)}`}
        leading={chipMarkOf(field)}
        onPress={(chip) => void pick(field, chip)}
      />
    );
  };

  const bar = (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="always"
      style={styles.bar}
      contentContainerStyle={styles.chips}
    >
      {BAR_FIELDS.map(chip)}
    </ScrollView>
  );

  return { chip, bar, menu: menu.menu };
}

function PropertyChip({
  label,
  unset,
  disabled,
  accessibilityLabel,
  leading,
  onPress,
  testID,
}: {
  label: string;
  unset: boolean;
  disabled: boolean;
  accessibilityLabel: string;
  leading?: ReactElement;
  onPress(chip: HostInstance | null): void;
  testID: string;
}) {
  const colors = useThemeColors();
  const chip = useRef<HostInstance>(null);
  return (
    <Pressable
      ref={chip}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => onPress(chip.current)}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: colors.muted },
        pressed && styles.pressed,
      ]}
      testID={testID}
    >
      {leading ?? null}
      <Text
        numberOfLines={1}
        style={[
          styles.chipLabel,
          { color: unset ? colors.mutedForeground : colors.foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexGrow: 0 },
  chips: {
    gap: space.sm,
    paddingHorizontal: layout.sideMargin,
    paddingVertical: space.sm,
  },
  chip: {
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space.md,
    borderRadius: 18,
  },
  pressed: { opacity: 0.7 },
  chipLabel: { fontSize: 14, lineHeight: 20 },
});
