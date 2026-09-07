import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  AlertTriangle,
  Camera,
  Crosshair,
  Monitor,
  MonitorOff,
} from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { desktopApi } from "@/lib";
import { AnnotationList } from "./annotation-list";
import {
  addAnnotationAtom,
  browserErrorAtom,
  browserTabsAtom,
  browserTitleAtom,
  browserUrlAtom,
  isAnnotationModeAtom,
  isBrowserLoadingAtom,
  isBrowserStreamingAtom,
} from "./browser-store";
import { BrowserTabs } from "./browser-tabs";
import { bindBrowserViewBounds } from "./browser-view-bounds";
import { BrowserUrlBar } from "./url-bar";

export function BrowserPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation("browser");
  const snapshot = useAtomValue(browserTabsAtom);
  const previewError = snapshot.tabs.find(
    (tab) => tab.id === snapshot.activeId,
  )?.previewError;
  const containerRef = useCallback((container: HTMLDivElement | null) => {
    if (container) return bindBrowserViewBounds(container, desktopApi);
  }, []);
  const [isAnnotationMode, setIsAnnotationMode] = useAtom(isAnnotationModeAtom);
  const browserUrl = useAtomValue(browserUrlAtom);
  const browserError = useAtomValue(browserErrorAtom);
  const browserTitle = useAtomValue(browserTitleAtom);
  const isLoading = useAtomValue(isBrowserLoadingAtom);
  const streaming = useAtomValue(isBrowserStreamingAtom);
  let pageLabel = browserTitle || browserUrl;
  if (streaming) pageLabel = t("states.generating");
  else if (isLoading) pageLabel = t("states.loading");
  const addAnnotation = useSetAtom(addAnnotationAtom);

  const toggleAnnotation = useCallback(() => {
    const next = !isAnnotationMode;
    setIsAnnotationMode(next);
    void desktopApi.browserToggleAnnotationMode(next);
  }, [isAnnotationMode, setIsAnnotationMode]);

  const captureScreenshot = useCallback(() => {
    void desktopApi.browserCaptureScreenshot().then((dataUrl) => {
      if (!dataUrl) return;
      const annotation = {
        id: crypto.randomUUID(),
        type: "region" as const,
        regionScreenshot: dataUrl,
        boundingBox: { x: 0, y: 0, width: 0, height: 0 },
        pageUrl: browserUrl,
        capturedAt: new Date().toISOString(),
      };
      addAnnotation(annotation, snapshot.activeId ?? undefined);
    });
  }, [addAnnotation, browserUrl, snapshot.activeId]);

  const showPlaceholder = !browserUrl;

  return (
    <Tabs
      value={snapshot.activeId ?? "empty"}
      onValueChange={(id) => {
        if (typeof id === "string") void desktopApi.browserActivateTab(id);
      }}
      className="h-full gap-0 overflow-hidden"
    >
      {snapshot.tabs.length > 0 && <BrowserTabs onEmpty={onClose} />}
      <TabsContent
        value={snapshot.activeId ?? "empty"}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
      >
        <BrowserUrlBar key={snapshot.activeId + browserUrl} />
        {previewError && (
          <Text
            role="alert"
            size="meta"
            className="border-b border-editor-border px-3 py-2"
          >
            {previewError}
          </Text>
        )}

        {browserError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
            <AlertTriangle className="size-8 text-editor-fg-muted" />
            <div>
              <p className="text-sm font-medium text-editor-fg-subtle">
                {t("states.loadError")}
              </p>
              <p className="mt-1 text-xs text-editor-fg-muted">
                {browserError}
              </p>
            </div>
          </div>
        ) : showPlaceholder ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
            <Monitor className="size-8 text-editor-fg-muted" />
            <p className="text-sm font-medium text-editor-fg-subtle">
              {t("placeholder.title")}
            </p>
            <p className="max-w-[240px] text-xs text-editor-fg-muted">
              {t("placeholder.description")}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-editor-border px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-meta text-editor-fg-subtle">
                {pageLabel}
              </span>
              <div className="flex items-center gap-0.5">
                <TitlebarIconButton
                  aria-label={t("actions.captureScreenshot")}
                  onClick={captureScreenshot}
                >
                  <Camera className={TITLEBAR_ICON_GLYPH_CLASS} />
                </TitlebarIconButton>
                <TitlebarIconButton
                  active={isAnnotationMode}
                  aria-label={
                    isAnnotationMode
                      ? t("actions.exitDesignMode")
                      : t("actions.enterDesignMode")
                  }
                  onClick={toggleAnnotation}
                >
                  {isAnnotationMode ? (
                    <MonitorOff className={TITLEBAR_ICON_GLYPH_CLASS} />
                  ) : (
                    <Crosshair className={TITLEBAR_ICON_GLYPH_CLASS} />
                  )}
                </TitlebarIconButton>
              </div>
            </div>

            <div
              ref={containerRef}
              className="relative min-h-0 flex-1 bg-white"
            />

            <AnnotationList />
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
