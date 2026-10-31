import type { AndroidSymbol, SFSymbol } from "expo-symbols";

export interface HeaderAction {
  key: string;
  icon: { ios: SFSymbol; android: AndroidSymbol };
  label: string;
  onPress(): void;
  badge?: boolean;
  disabled?: boolean;
}

export interface ListScreenHeaderProps {
  title: string;
  search?: { placeholder: string; onQuery(query: string): void };
  actions?: readonly HeaderAction[];
  background?: string;
}
