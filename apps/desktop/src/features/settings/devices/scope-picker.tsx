import {
  type HostAccessScope,
  PAIRABLE_HOST_ACCESS_SCOPES,
} from "@cocurdex/shared";
import { useId } from "react";
import { Checkbox, Text } from "@/components/ui";
import { useScopeLabels } from "./host-access-labels";

export function ScopePicker({
  scopes,
  onChange,
}: {
  scopes: HostAccessScope[];
  onChange(next: HostAccessScope[]): void;
}) {
  const labels = useScopeLabels();
  const idPrefix = useId();
  return (
    <div className="flex flex-col gap-2">
      {PAIRABLE_HOST_ACCESS_SCOPES.map((scope) => (
        <label
          className="flex cursor-pointer items-start gap-2"
          htmlFor={`${idPrefix}-${scope}`}
          key={scope}
        >
          <Checkbox
            checked={scopes.includes(scope)}
            className="mt-0.5"
            id={`${idPrefix}-${scope}`}
            onCheckedChange={(checked) =>
              onChange(
                checked
                  ? [...scopes, scope]
                  : scopes.filter((item) => item !== scope),
              )
            }
          />
          <span className="flex min-w-0 flex-col">
            <Text size="body">{labels[scope].title}</Text>
            <Text size="meta" tone="muted">
              {labels[scope].description}
            </Text>
          </span>
        </label>
      ))}
    </div>
  );
}
