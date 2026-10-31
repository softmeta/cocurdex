import { Children } from "react";
import { FormCell } from "./form-cell";
import type { FormSectionProps } from "./form-props";
import { FormSection } from "./form-section";

export function FieldSection({ children, ...props }: FormSectionProps) {
  return (
    <FormSection {...props}>
      {Children.map(children, (field) => (
        <FormCell>{field}</FormCell>
      ))}
    </FormSection>
  );
}
