import type { WorkspaceRecord } from "@cocurdex/shared";
import type { ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { AppPreviewCardTooltipContent } from "@/components/app";
import { Text, Tooltip, TooltipTrigger } from "@/components/ui";
import { splitWorkspacePath } from "./workspace-path";

type WorkspaceRoots = Pick<WorkspaceRecord, "rootPaths">;

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

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <WorkspaceRootGroup
        label={t("workspace.rootsPrimary")}
        paths={[primaryPath]}
      />
      {additionalPaths.length > 0 ? (
        <WorkspaceRootGroup
          label={t("workspace.rootsAdditional")}
          paths={additionalPaths}
        />
      ) : null}
    </div>
  );
}

export function WorkspaceRootsTooltip({
  children,
  side = "top",
  workspace,
}: {
  children: ReactElement;
  side?: "top" | "bottom";
  workspace?: WorkspaceRoots | null;
}) {
  if (!workspace || workspace.rootPaths.length === 0) {
    return children;
  }

  return (
    <Tooltip disableHoverablePopup>
      <TooltipTrigger asChild>
        <span className="flex min-w-0">{children}</span>
      </TooltipTrigger>
      <AppPreviewCardTooltipContent align="start" side={side} sideOffset={6}>
        <WorkspaceRootsPreview workspace={workspace} />
      </AppPreviewCardTooltipContent>
    </Tooltip>
  );
}
