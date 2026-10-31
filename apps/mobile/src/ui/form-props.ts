import type { ReactNode } from "react";

export interface FormProps {
  children: ReactNode;
  adjustsForKeyboard?: boolean;
}

export interface FormSectionProps {
  title?: string;
  header?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
}

export interface FormRowProps {
  children: ReactNode;
  supporting?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  testID?: string;
  disabled?: boolean;
  selected?: boolean;
  onPress?(): void;
}
