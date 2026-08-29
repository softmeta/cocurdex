import type * as React from "react";

import { cn } from "@/lib/utils";

// Base UI does not ship a standalone Label primitive — the native <label>
// element already forwards clicks to associated form controls. Field.Label
// from `@base-ui/react/field` is reserved for Field-scoped usage.
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: htmlFor is supplied by consumers when associating with a form control.
    <label
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
