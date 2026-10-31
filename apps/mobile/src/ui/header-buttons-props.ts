import type { AndroidSymbol, SFSymbol } from "expo-symbols";

export interface HeaderButtonItem {
  key: string;
  icon: { ios: SFSymbol; android: AndroidSymbol };
  label: string;
  onPress(): void;
  hidden?: boolean;
  disabled?: boolean;
}

export interface HeaderButtonsProps {
  items: readonly HeaderButtonItem[];
}
