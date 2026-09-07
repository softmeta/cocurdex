import { useAtomValue } from "jotai";
import { ArrowLeft, ArrowRight, Globe, RefreshCw, X } from "lucide-react";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { Input } from "@/components/ui";
import { desktopApi } from "@/lib";
import {
  browserTitleAtom,
  browserUrlAtom,
  isBrowserLoadingAtom,
  isBrowserStreamingAtom,
} from "./browser-store";

// Local dev servers rarely serve TLS; everything else on today's web does.
function withDefaultScheme(url: string): string {
  if (
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("cocurdex-html://")
  ) {
    return url;
  }
  const host = url.split(/[/:]/, 1)[0];
  const isLocal =
    host === "localhost" || host === "0.0.0.0" || host.startsWith("127.");
  return isLocal ? `http://${url}` : `https://${url}`;
}

export function BrowserUrlBar() {
  const { t } = useTranslation("browser");
  const url = useAtomValue(browserUrlAtom);
  const title = useAtomValue(browserTitleAtom);
  const [urlInput, setUrlInput] = useState(url);
  const isHtmlPreview = url.startsWith("cocurdex-html:");
  const displayUrl = isHtmlPreview ? title || t("tabs.htmlPreview") : urlInput;
  const isLoading = useAtomValue(isBrowserLoadingAtom);
  const streaming = useAtomValue(isBrowserStreamingAtom);
  const navigating = isLoading && !streaming;
  const inputRef = useRef<HTMLInputElement>(null);

  const navigate = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!trimmed) return;

    const targetUrl = withDefaultScheme(trimmed);
    setUrlInput(targetUrl);
    void desktopApi.browserNavigate(targetUrl);
  }, []);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        navigate(urlInput);
      }
    },
    [navigate, urlInput],
  );

  return (
    <div className="flex items-center gap-1 border-b border-editor-border px-2 py-1.5">
      <TitlebarIconButton
        aria-label={t("actions.back")}
        onClick={() => {
          void desktopApi.browserGoBack();
        }}
      >
        <ArrowLeft className="size-3.5 rtl:rotate-180" />
      </TitlebarIconButton>
      <TitlebarIconButton
        aria-label={t("actions.forward")}
        onClick={() => {
          void desktopApi.browserGoForward();
        }}
      >
        <ArrowRight className="size-3.5 rtl:rotate-180" />
      </TitlebarIconButton>
      <TitlebarIconButton
        aria-label={navigating ? t("actions.stop") : t("actions.reload")}
        disabled={streaming}
        onClick={() => {
          if (navigating) {
            void desktopApi.browserStop();
          } else {
            void desktopApi.browserReload();
          }
        }}
      >
        {navigating ? (
          <X className={TITLEBAR_ICON_GLYPH_CLASS} />
        ) : (
          <RefreshCw className={TITLEBAR_ICON_GLYPH_CLASS} />
        )}
      </TitlebarIconButton>
      <div className="relative flex min-w-0 flex-1 items-center">
        <Globe className="absolute start-2 size-3.5 shrink-0 text-editor-fg-muted" />
        <Input
          ref={inputRef}
          type="text"
          value={displayUrl}
          readOnly={isHtmlPreview}
          aria-label={t("tabs.address")}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("urlPlaceholder")}
          className="h-7 w-full rounded-control border-0 bg-editor-pane ps-7 pe-2 text-meta text-editor-fg shadow-none placeholder:text-editor-fg-muted"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
