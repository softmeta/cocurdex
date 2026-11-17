import { useTranslation } from "react-i18next";
import { CapsuleTabs } from "@/ui";

const ALL_GROUPS = "all";

export interface SessionGroupChip {
  key: string;
  label: string;
  count: number;
}

export function SessionGroupChips({
  chips,
  selectedKey,
  onSelect,
}: {
  chips: readonly SessionGroupChip[];
  selectedKey: string | null;
  onSelect(key: string | null): void;
}) {
  const { t } = useTranslation("sessions");
  return (
    <CapsuleTabs
      testID="session-group"
      tabs={[
        { key: ALL_GROUPS, label: t("list.allGroups") },
        ...chips.map((chip) => ({ ...chip, key: `group:${chip.key}` })),
      ]}
      selectedKey={selectedKey === null ? ALL_GROUPS : `group:${selectedKey}`}
      onSelect={(key) =>
        onSelect(key === ALL_GROUPS ? null : key.slice("group:".length))
      }
    />
  );
}
