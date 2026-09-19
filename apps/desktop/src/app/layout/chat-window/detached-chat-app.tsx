import { useAtomValue, useStore } from "jotai";
import { PanelLeft } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FileTypeIconSprite } from "@/components";
import { Button, Text, Toaster } from "@/components/ui";
import { useChatEventBridge } from "@/features/chat";
import { composerDraftsAtom } from "@/features/composer";
import { sessionSplitLayoutAtom } from "@/features/sessions";
import { HostDirectoryPickerHost } from "@/features/workspaces";
import { desktopApi, useMountEffect } from "@/lib";
import type { ChatWindowTransfer } from "@/lib/chat-window-types";
import { useAgentEventBridge } from "../app-shell/app-shell-events";
import { syncInitialPreferences } from "../app-shell/app-shell-preferences";
import { SessionSplitLayout } from "../session-split";
import { LeftSidebar } from "../sidebar";
import { TitlebarIconButton } from "../titlebar-icon-button";
import { useChatBrowserContext } from "./chat-browser-context";
import { ChatWindowButton } from "./chat-window-controls";
import {
  applyChatSnapshot,
  hydrateChatWindow,
  serializeChatSnapshot,
} from "./chat-window-snapshot";
import { chatWindowBusyAtom, chatWindowStateAtom } from "./chat-window-state";
import { useChatContext } from "./use-chat-context";

function DetachedChatContent({ transfer }: { transfer: ChatWindowTransfer }) {
  const { t } = useTranslation("editor");
  const store = useStore();
  const busy = useAtomValue(chatWindowBusyAtom);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const composerRef = useChatContext(() => setSidebarOpen(false));
  useChatBrowserContext();

  useMountEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        void desktopApi.chatWindow.ready(transfer.id).catch(console.error);
      });
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const checkpoint = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        void desktopApi.chatWindow
          .checkpoint(serializeChatSnapshot(store))
          .catch(console.error);
      }, 250);
    };
    const unsubscribeDrafts = store.sub(composerDraftsAtom, checkpoint);
    const unsubscribeLayout = store.sub(sessionSplitLayoutAtom, checkpoint);
    const unsubscribeState = desktopApi.chatWindow.onState((state) =>
      store.set(chatWindowStateAtom, state),
    );
    window.addEventListener("blur", checkpoint);
    const theme = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("storage", syncInitialPreferences);
    theme.addEventListener("change", syncInitialPreferences);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
      unsubscribeDrafts();
      unsubscribeLayout();
      unsubscribeState();
      window.removeEventListener("blur", checkpoint);
      window.removeEventListener("storage", syncInitialPreferences);
      theme.removeEventListener("change", syncInitialPreferences);
    };
  });

  return (
    <div
      className="flex h-screen min-w-0 flex-col overflow-hidden bg-chat-canvas"
      inert={busy}
    >
      <div className="app-drag flex h-8 shrink-0 items-center justify-end gap-1 border-b border-border px-2">
        <TitlebarIconButton
          active={sidebarOpen}
          aria-label={t("actions.toggleChatSessions")}
          onClick={() => setSidebarOpen(!sidebarOpen)}
        >
          <PanelLeft className="size-3.5" />
        </TitlebarIconButton>
        <ChatWindowButton />
      </div>
      <div className="relative min-h-0 flex-1">
        <SessionSplitLayout composerRef={composerRef} hideTitlebarSpacer />
        {sidebarOpen ? (
          <div className="app-no-drag absolute inset-0 z-50 flex">
            <div className="h-full w-64 shrink-0 border-e border-border bg-sidebar shadow-lg">
              <LeftSidebar
                hideTitlebarSpacer
                onAfterNavigate={() => setSidebarOpen(false)}
              />
            </div>
            <button
              aria-label={t("actions.closeChatSessions")}
              className="min-w-0 flex-1"
              onClick={() => setSidebarOpen(false)}
              type="button"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function DetachedChatApp() {
  const synchronizeAgentState = useAgentEventBridge();
  useChatEventBridge();
  const store = useStore();
  const { t } = useTranslation("sessions");
  const [transfer, setTransfer] = useState<ChatWindowTransfer | null>(null);
  const [error, setError] = useState<string | null>(null);
  useMountEffect(() => {
    let cancelled = false;
    void (async () => {
      const initial = await desktopApi.chatWindow.bootstrap();
      if (!initial) throw new Error("No chat window transfer is available");
      await hydrateChatWindow(store, initial.snapshot, synchronizeAgentState);
      if (cancelled) return;
      applyChatSnapshot(store, initial.snapshot);
      setTransfer(initial);
    })().catch((reason: unknown) => {
      if (cancelled) return;
      const message = reason instanceof Error ? reason.message : String(reason);
      setError(message);
      toast.error(message);
    });
    return () => {
      cancelled = true;
    };
  });
  return (
    <>
      <FileTypeIconSprite />
      {transfer ? <DetachedChatContent transfer={transfer} /> : null}
      {error ? (
        <div className="flex h-screen flex-col items-center justify-center gap-3 p-4">
          <Text>{error}</Text>
          <Button variant="outline" onClick={() => window.location.reload()}>
            {t("window.retry")}
          </Button>
        </div>
      ) : null}
      <Toaster />
      <HostDirectoryPickerHost />
    </>
  );
}
