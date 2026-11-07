import { useAtomValue, useSetAtom } from "jotai";
import { startTransition } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { selectSessionAtom } from "@/features/sessions";
import {
  activeWorkspaceIdAtom,
  openWorkspaceByPathAtom,
  pickHostDirectoryAtom,
  selectWorkspaceAtom,
} from "@/features/workspaces";
import { useCreatePersonalAgent } from "../use-create-personal-agent";
import { type SidebarTab, sidebarTabAtom } from "./sidebar-tab-store";

interface SidebarCreateOptions {
  beforeSelect?(): void;
  onAfterNavigate?(): void;
}

export interface SidebarCreateAction {
  label: string;
  run(): void;
}

export function useSidebarCreateActions({
  beforeSelect,
  onAfterNavigate,
}: SidebarCreateOptions = {}) {
  const { t } = useTranslation(["sessions", "chat", "personal"]);
  const activeTab = useAtomValue(sidebarTabAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const selectWorkspace = useSetAtom(selectWorkspaceAtom);
  const selectSession = useSetAtom(selectSessionAtom);
  const openWorkspaceByPath = useSetAtom(openWorkspaceByPathAtom);
  const pickHostDirectory = useSetAtom(pickHostDirectoryAtom);
  const createPersonalAgent = useCreatePersonalAgent();

  const openWorkspace = async () => {
    const rootPath = await pickHostDirectory();
    if (!rootPath) return;
    const { workspace, didSwitchWorkspace, reusedUnderDifferentName } =
      openWorkspaceByPath(rootPath);
    if (reusedUnderDifferentName) {
      toast(t("sessions:workspace.openedExisting", { name: workspace.name }));
    }
    if (didSwitchWorkspace) {
      selectSession(null);
    }
  };

  const createSession = (workspaceId?: string) => {
    const targetWorkspaceId = workspaceId ?? activeWorkspaceId;
    if (!targetWorkspaceId) {
      void openWorkspace();
      return;
    }
    startTransition(() => {
      beforeSelect?.();
      selectWorkspace(targetWorkspaceId);
      selectSession(null);
    });
    onAfterNavigate?.();
  };

  const createChat = () => {
    selectSession(null);
    onAfterNavigate?.();
  };

  const actions: Record<SidebarTab, SidebarCreateAction> = {
    workspaces: {
      label: t("sessions:sidebar.newSession"),
      run: () => createSession(),
    },
    chat: { label: t("chat:list.new"), run: createChat },
    personal: {
      label: t("personal:roster.new"),
      run: () => void createPersonalAgent(),
    },
  };

  return {
    activeTab,
    create: actions[activeTab],
    createSession,
    openWorkspace,
  };
}
