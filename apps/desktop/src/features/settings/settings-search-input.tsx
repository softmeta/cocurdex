import { Search } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui";

export function SettingsSearchInput({
  trailing,
  ...props
}: Omit<ComponentProps<typeof InputGroupInput>, "className"> & {
  trailing?: ReactNode;
}) {
  return (
    <InputGroup>
      <InputGroupAddon>
        <Search />
      </InputGroupAddon>
      <InputGroupInput {...props} />
      {trailing ? (
        <InputGroupAddon align="inline-end">{trailing}</InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
