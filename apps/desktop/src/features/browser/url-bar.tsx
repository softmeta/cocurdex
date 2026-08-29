import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { ArrowLeft, ArrowRight, Globe, RefreshCw, X } from "lucide-react";
import { type KeyboardEvent, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  TITLEBAR_ICON_GLYPH_CLASS,
  TitlebarIconButton,
} from "@/app/layout/titlebar-icon-button";
import { Input } from "@/components/ui";
import { desktopApi } from "@/lib";
import {
  browserErrorAtom,
  browserUrlAtom,
  browserUrlInputAtom,
  isBrowserLoadingAtom,
} from "./browser-store";

// Local dev servers rarely serve TLS; everything else on today's web does.
function withDefaultScheme(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url;
  }
  const host = url.split(/[/:]/, 1)[0];
  const isLocal =
    host === "localhost" || host === "0.0.0.0" || host.startsWith("127.");
  return isLocal ? `http://${url}` : `https://${url}`;
}

export function BrowserUrlBar() {
  const { t } = useTranslation("browser");
  const [urlInput, setUrlInput] = useAtom(browserUrlInputAtom);
  const setBrowserUrl = useSetAtom(browserUrlAtom);
  const setBrowserError = useSetAtom(browserErrorAtom);
  const isLoading = useAtomValue(isBrowserLoadingAtom);
  const inputRef = useRef<HTMLInputElement>(null);

  const navigate = useCallback(
    (url: string) => {
      const trimmed = url.trim();
      if (!trimmed) return;

      const targetUrl = withDefaultScheme(trimmed);
      setBrowserUrl(targetUrl);
      setUrlInput(targetUrl);
      setBrowserError(null);
      void desktopApi.browserNavigate(targetUrl);
    },
    [setBrowserUrl, setUrlInput, setBrowserError],
  );

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
        <ArrowLeft className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
      <TitlebarIconButton
        aria-label={t("actions.forward")}
        onClick={() => {
          void desktopApi.browserGoForward();
        }}
      >
        <ArrowRight className={TITLEBAR_ICON_GLYPH_CLASS} />
      </TitlebarIconButton>
      <TitlebarIconButton
        aria-label={isLoading ? t("actions.stop") : t("actions.reload")}
        onClick={() => {
          if (isLoading) {
            void desktopApi.browserStop();
          } else {
            void desktopApi.browserReload();
          }
        }}
      >
        {isLoading ? (
          <X className={TITLEBAR_ICON_GLYPH_CLASS} />
        ) : (
          <RefreshCw className={TITLEBAR_ICON_GLYPH_CLASS} />
        )}
      </TitlebarIconButton>
      <div className="relative flex min-w-0 flex-1 items-center">
        <Globe className="absolute left-2 size-3.5 shrink-0 text-editor-fg-muted" />
        <Input
          ref={inputRef}
          type="text"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("urlPlaceholder")}
          className="h-7 w-full rounded-control border-0 bg-editor-pane pl-7 pr-2 text-xs text-editor-fg shadow-none placeholder:text-editor-fg-muted focus-visible:ring-1 focus-visible:ring-blue-500/40"
          spellCheck={false}
        />
      </div>
    </div>
  );
}
