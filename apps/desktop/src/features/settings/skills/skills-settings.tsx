import { useAtomValue } from "jotai";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Text,
} from "@/components/ui";
import { activeWorkspaceIdAtom, workspacesAtom } from "@/features/workspaces";
import { SkillAddDialog } from "./skill-add-dialog";
import { SkillDiscoverView } from "./skill-discover-view";
import { SkillLibraryView } from "./skill-library-view";
import { useSkillLibrary } from "./use-skill-library";
import { useSkillPack } from "./use-skill-pack";

type SkillsTab = "installed" | "discover";

interface AddRequest {
  source?: string;
  skillPaths?: string[];
}

function SkillsSettings({
  workspaceId,
  workspaceRootPath,
}: {
  workspaceId: string | null;
  workspaceRootPath: string | null;
}) {
  const { t } = useTranslation("settings");
  const library = useSkillLibrary(workspaceId);
  const pack = useSkillPack(workspaceRootPath);
  const [tab, setTab] = useState<SkillsTab>("installed");
  const [addRequest, setAddRequest] = useState<AddRequest | null>(null);
  const skills = library.library?.skills ?? [];
  const workspaceName = library.library?.workspace?.name ?? null;
  const installedCount = skills.filter((skill) => !skill.builtin).length;
  const isLibraryLoaded = library.library !== null || library.loadError !== "";

  if (!(isLibraryLoaded && pack.isLoaded)) {
    return <div className="min-h-0 flex-1" />;
  }

  return (
    <div className="settings-panel-enter flex min-h-0 min-w-0 flex-1 flex-col gap-5">
      <div className="flex shrink-0 items-start justify-between gap-4">
        <Text className="max-w-2xl" size="body" tone="muted">
          {t("skills.description")}
        </Text>
        <Button
          className="shrink-0"
          type="button"
          variant="secondary"
          onClick={() => setAddRequest({})}
        >
          <Plus className="size-4" />
          {t("skills.add.open")}
        </Button>
      </div>
      <Tabs
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-4"
        value={tab}
        onValueChange={(value) => setTab(value as SkillsTab)}
      >
        <TabsList className="shrink-0" variant="line">
          <TabsTrigger value="installed">
            {t("skills.tabs.installed", { count: installedCount })}
          </TabsTrigger>
          <TabsTrigger value="discover">
            {t("skills.tabs.discover")}
          </TabsTrigger>
        </TabsList>
        <TabsContent
          className="flex min-h-0 min-w-0 flex-col"
          value="installed"
        >
          <SkillLibraryView library={library} pack={pack} />
        </TabsContent>
        <TabsContent className="flex min-h-0 min-w-0 flex-col" value="discover">
          <SkillDiscoverView
            installed={skills}
            onInstall={(source, skillPaths) =>
              setAddRequest({ source, skillPaths })
            }
          />
        </TabsContent>
      </Tabs>
      {addRequest ? (
        <SkillAddDialog
          initialSkillPaths={addRequest.skillPaths}
          initialSource={addRequest.source}
          installed={skills}
          workspaceId={workspaceId}
          workspaceName={workspaceName}
          onClose={() => setAddRequest(null)}
          onInstalled={() => void library.refresh()}
        />
      ) : null}
    </div>
  );
}

export function SkillsSettingsPanel() {
  const workspaces = useAtomValue(workspacesAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const workspace =
    workspaces.find((item) => item.id === activeWorkspaceId) ?? null;
  return (
    <SkillsSettings
      key={workspace?.id ?? "no-workspace"}
      workspaceId={workspace?.id ?? null}
      workspaceRootPath={workspace?.rootPaths[0] ?? null}
    />
  );
}
