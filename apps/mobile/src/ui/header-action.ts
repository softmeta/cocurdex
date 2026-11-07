import type { AndroidSymbol, SFSymbol } from "expo-symbols";
import type { MenuAnchor } from "./menu-placement";

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
  titleAction?: {
    label: string;
    testID: string;
    onPress(anchor: MenuAnchor): void;
  };
  search?: { placeholder: string; onQuery(query: string): void };
  actions?: readonly HeaderAction[];
  background?: string;
}
