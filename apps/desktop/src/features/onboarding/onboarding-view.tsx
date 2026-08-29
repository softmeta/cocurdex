import { isChatCapableModel, isChatSupportedApi } from "@cocurdex/shared";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { ArrowRight, FolderOpen, MessageSquare, Settings2 } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { CocurdexMark } from "@/components/cocurdex-mark";
import { Button, Checkbox, Text } from "@/components/ui";
// Sub-entries, not the settings barrel: that barrel pulls in SettingsScreen,
// which imports @/app/layout and would close a cycle back onto this screen.
import { providerModelsAtom } from "@/features/sessions";
import { AdapterSettingsPanel } from "@/features/settings/adapters";
import { ProviderSettingsPanel } from "@/features/settings/providers";
import {
  activeWorkspaceIdAtom,
  selectWorkspaceAtom,
  WorkspacePicker,
  workspacesAtom,
} from "@/features/workspaces";
import { cn } from "@/lib";
import { onboardingDismissedAtom } from "./onboarding-store";

interface OnboardingViewProps {
  // Owned by the app shell so this screen reserves the same draggable strip as
  // the main frame without reaching into layout constants.
  titlebarHeight: number;
  onOpenWorkspace(): void;
  onStartChat(): void;
  onSkip(): void;
  onEnterApp(): void;
}

function OnboardingProviders() {
  const { t } = useTranslation("onboarding");

  return (
    <div className="flex min-w-0 flex-col">
      {/* Sticks while the panel below scrolls, so the column keeps its label.
          Owns the top padding: with it on the scroll container instead, content
          would show through the gap above this block. */}
      <div className="sticky top-0 z-10 flex flex-col gap-1 bg-app pt-6 pb-4">
        <Text as="h2" size="body" weight="medium">
          {t("providers.title")}
        </Text>
        <Text size="meta" tone="muted">
          {t("providers.description")}
        </Text>
      </div>
      <ProviderSettingsPanel />
    </div>
  );
}

function OnboardingWelcome({
  onConfigureProviders,
  onEnterApp,
  onOpenWorkspace,
  onStartChat,
  onSkip,
  providersOpen,
}: Omit<OnboardingViewProps, "titlebarHeight"> & {
  onConfigureProviders(): void;
  providersOpen: boolean;
}) {
  const { t } = useTranslation("onboarding");
  const [dismissed, setDismissed] = useAtom(onboardingDismissedAtom);
  const dismissCheckboxId = useId();
  const workspaces = useAtomValue(workspacesAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  const selectWorkspace = useSetAtom(selectWorkspaceAtom);
  const activeWorkspace =
    workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  // Chat mode cannot run without a provider, so its way in only appears once
  // one is configured — matching what the chat composer will accept.
  const hasChatModel = useAtomValue(providerModelsAtom).some(
    (model) =>
      model.enabled &&
      isChatSupportedApi(model.api) &&
      isChatCapableModel(model.capabilities),
  );

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5">
          <CocurdexMark className="size-7" interactive />
          <Text as="h1" size="title" weight="medium">
            {t("title")}
          </Text>
        </div>
        <Text size="body" tone="muted">
          {t("description")}
        </Text>
      </div>

      <AdapterSettingsPanel />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {activeWorkspace ? (
            <WorkspacePicker
              activeWorkspaceId={activeWorkspaceId}
              appearance="outline"
              onOpenWorkspace={onOpenWorkspace}
              onSelectWorkspace={selectWorkspace}
              workspaceName={activeWorkspace.name}
              workspaces={workspaces}
            />
          ) : (
            <Button onClick={onOpenWorkspace} type="button">
              <FolderOpen className="size-4" />
              {t("action.openProject")}
            </Button>
          )}
          <Button
            aria-pressed={providersOpen}
            onClick={onConfigureProviders}
            type="button"
            variant="outline"
          >
            <Settings2 className="size-4" />
            {t("action.configureProviders")}
          </Button>
        </div>
        <Text size="meta" tone="muted">
          {t("action.openProjectHint")}
        </Text>
      </div>

      {activeWorkspace || hasChatModel ? (
        <div className="flex flex-wrap items-center gap-2">
          {activeWorkspace ? (
            <Button onClick={onEnterApp} type="button">
              {t("action.enterApp")}
              <ArrowRight className="size-4" />
            </Button>
          ) : null}
          {hasChatModel ? (
            <Button
              onClick={onStartChat}
              type="button"
              variant={activeWorkspace ? "outline" : "default"}
            >
              <MessageSquare className="size-4" />
              {t("action.startChat")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <label
          className="flex items-center gap-2 text-meta text-muted-foreground"
          htmlFor={dismissCheckboxId}
        >
          <Checkbox
            checked={dismissed}
            id={dismissCheckboxId}
            onCheckedChange={(checked) => setDismissed(checked === true)}
          />
          {t("action.dontShowAgain")}
        </label>
        <Button onClick={onSkip} size="xs" type="button" variant="ghost">
          {t("action.skip")}
        </Button>
      </div>
    </>
  );
}

/**
 * First-run welcome screen, shown instead of the app frame: panel chrome around
 * an app with no projects reads as broken. It answers "what can this app do on
 * my machine, and what do I do next" — the adapter panel reports which agent
 * CLIs are installed, and each action is a complete way in. Provider setup runs
 * inline rather than in the settings screen, so the flow is never handed off to
 * app chrome the user has not seen yet.
 */
export function OnboardingView({
  titlebarHeight,
  onEnterApp,
  onOpenWorkspace,
  onStartChat,
  onSkip,
}: OnboardingViewProps) {
  const [showProviders, setShowProviders] = useState(false);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-app text-app-foreground">
      <div className="app-drag shrink-0" style={{ height: titlebarHeight }} />
      <div className="min-h-0 flex-1 overflow-hidden">
        {/* Provider setup opens beside the welcome column rather than replacing
            it, so setup and the ways in stay on one page. */}
        {/* Grid columns interpolate, so opening the panel slides the welcome
            column into place instead of snapping it to a new width. */}
        <div
          className={cn(
            "mx-auto grid h-full w-full max-w-[78rem] justify-center gap-x-10 px-8 grid-cols-[minmax(0,46rem)_minmax(0,0rem)] transition-[grid-template-columns] duration-300 ease-out",
            showProviders && "grid-cols-[minmax(0,30rem)_minmax(0,44rem)]",
          )}
        >
          {/* Each column scrolls on its own: the provider panel is far taller
              than the welcome column and must not drag it out of view. */}
          <div className="flex min-h-0 min-w-0 flex-col gap-8 overflow-y-auto pt-6 pb-12">
            <OnboardingWelcome
              onConfigureProviders={() => setShowProviders((open) => !open)}
              onEnterApp={onEnterApp}
              onOpenWorkspace={onOpenWorkspace}
              onSkip={onSkip}
              onStartChat={onStartChat}
              providersOpen={showProviders}
            />
          </div>
          <div
            aria-hidden={!showProviders}
            className={cn(
              "min-h-0 overflow-x-hidden overflow-y-auto pb-12 opacity-0 transition-opacity duration-200 ease-out",
              showProviders && "opacity-100 delay-150",
            )}
          >
            <OnboardingProviders />
          </div>
        </div>
      </div>
    </div>
  );
}
