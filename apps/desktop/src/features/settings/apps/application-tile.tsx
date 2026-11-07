import type { ApplicationId } from "@cocurdex/shared";
import { cn } from "@/lib";
import { ApplicationIcon } from "./application-icon";

export function ApplicationTile({
  applicationId,
  size = "md",
}: {
  applicationId: ApplicationId;
  size?: "md" | "lg";
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-card bg-background text-foreground ring-1 ring-menu-ring",
        size === "lg" ? "size-12" : "size-9",
      )}
    >
      <ApplicationIcon
        applicationId={applicationId}
        className={size === "lg" ? "size-6" : "size-4.5"}
      />
    </span>
  );
}
