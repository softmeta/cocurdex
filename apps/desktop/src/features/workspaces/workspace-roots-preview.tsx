import type { WorkspaceRecord } from "@cocurdex/shared";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Text, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui";
import { compactWorkspacePath, splitWorkspacePath } from "./workspace-path";

type WorkspaceRoots = Pick<WorkspaceRecord, "name" | "rootPaths">;

function WorkspaceRootRow({ path }: { path: string }) {
  const { name, parent } = splitWorkspacePath(path);

  return (
    <Text size="meta" className="min-w-0 break-all">
      {name}
      {parent ? (
        <Text size="meta" tone="muted" className="ms-1.5">
          {parent}
        </Text>
      ) : null}
    </Text>
  );
}

function WorkspaceRootGroup({
  label,
  paths,
}: {
  label: string;
  paths: string[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Text size="meta" tone="muted">
        {label}
      </Text>
      {paths.map((path) => (
        <WorkspaceRootRow key={path} path={path} />
      ))}
    </div>
  );
}

export function WorkspaceRootsPreview({
  workspace,
}: {
  workspace: WorkspaceRoots;
}) {
  const { t } = useTranslation("sessions");
  const [primaryPath, ...additionalPaths] = workspace.rootPaths;

  if (additionalPaths.length > 0) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-2.5">
        <Text size="body" weight="medium" className="min-w-0 whitespace-normal">
          {workspace.name}
        </Text>
        <div className="flex min-w-0 flex-col gap-2">
          <WorkspaceRootGroup
            label={t("workspace.rootsPrimary")}
            paths={[primaryPath]}
          />
          <WorkspaceRootGroup
            label={t("workspace.rootsAdditional")}
            paths={additionalPaths}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <Text size="body" className="min-w-0 whitespace-normal">
        {workspace.name}
      </Text>
      {workspace.rootPaths.map((path) => (
        <Text className="min-w-0 break-all" key={path} size="meta" tone="muted">
          {compactWorkspacePath(path)}
        </Text>
      ))}
    </div>
  );
}

export function MultiRootWorkspaceTooltip({
  children,
  side = "top",
  workspace,
}: {
  children: ReactElement;
  side?: "top" | "bottom";
  workspace?: WorkspaceRoots | null;
}) {
  if (!workspace || workspace.rootPaths.length < 2) {
    return children;
  }

  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger asChild>
        <span className="flex min-w-0">{children}</span>
      </TooltipTrigger>
      <TooltipContent
        align="start"
        hideArrow
        side={side}
        sideOffset={6}
        className="min-w-0 max-w-72 flex-col items-stretch gap-1 rounded-card bg-popover px-3 py-2 text-start text-body text-popover-foreground shadow-md ring-1 ring-foreground/10"
      >
        <WorkspaceRootsPreview workspace={workspace} />
      </TooltipContent>
    </Tooltip>
  );
}
