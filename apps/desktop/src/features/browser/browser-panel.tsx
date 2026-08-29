import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  AlertTriangle,
  Camera,
  Crosshair,
  Monitor,
  MonitorOff,
} from "lucide-react";
import { useCallback, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { desktopApi } from "@/lib";
import { AnnotationList } from "./annotation-list";
import {
  addAnnotationAtom,
  browserErrorAtom,
  browserTitleAtom,
  browserUrlAtom,
  isAnnotationModeAtom,
  isBrowserLoadingAtom,
} from "./browser-store";
import { BrowserUrlBar } from "./url-bar";

export function BrowserPanel() {
  const { t } = useTranslation("browser");
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAnnotationMode, setIsAnnotationMode] = useAtom(isAnnotationModeAtom);
  const browserUrl = useAtomValue(browserUrlAtom);
  const browserError = useAtomValue(browserErrorAtom);
  const browserTitle = useAtomValue(browserTitleAtom);
  const isLoading = useAtomValue(isBrowserLoadingAtom);
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
      addAnnotation(annotation);
    });
  }, [addAnnotation, browserUrl]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the container div only renders when browserUrl is set and browserError is null, so the effect must re-run when either changes to show/hide the native view
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) {
      void desktopApi.browserShow(false);
      return;
    }

    const observer = new ResizeObserver(() => {
      const rect = container.getBoundingClientRect();
      void desktopApi.setBrowserBounds({
        x: rect.left,
        y: rect.top,
        w: rect.width,
        h: rect.height,
      });
    });

    observer.observe(container);
    void desktopApi.browserShow(true);

    const rect = container.getBoundingClientRect();
    void desktopApi.setBrowserBounds({
      x: rect.left,
      y: rect.top,
      w: rect.width,
      h: rect.height,
    });

    return () => {
      observer.disconnect();
      void desktopApi.browserShow(false);
    };
  }, [browserUrl, browserError]);

  const showPlaceholder = !browserUrl;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <BrowserUrlBar />

      {browserError ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-4 text-center">
          <AlertTriangle className="size-8 text-editor-fg-muted" />
          <div>
            <p className="text-sm font-medium text-editor-fg-subtle">
              {t("states.loadError")}
            </p>
            <p className="mt-1 text-xs text-editor-fg-muted">{browserError}</p>
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
              {isLoading ? t("states.loading") : browserTitle || browserUrl}
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
    </div>
  );
}
