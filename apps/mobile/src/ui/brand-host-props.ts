import type { UniversalHostProps } from "@expo/ui";
import type { ReactNode } from "react";

export type BrandHostProps = Omit<
  UniversalHostProps,
  "seedColor" | "children"
> & {
  children: ReactNode;
};
