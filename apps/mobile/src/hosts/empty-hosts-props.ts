import type { UniversalHostProps } from "@expo/ui";

export interface EmptyHostsProps {
  onScan(): void;
  onPaste(): void;
  onLayoutContent?: UniversalHostProps["onLayoutContent"];
}
