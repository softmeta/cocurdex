import { useAtomValue } from "jotai";
import { Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  CodeBlockCopyButton,
  CodeBlockDownloadButton,
  type CustomRendererProps,
} from "streamdown";
import { IconButton } from "@/components/ui/icon-button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Text } from "@/components/ui/text";
import { htmlPreviewLocationAtom, openHtmlPreviewInBrowser } from "@/lib";
import { HtmlCode } from "./html-code";
import { useBrowserPreview } from "./use-browser-preview";
import { usePreviewFrame } from "./use-preview-frame";

function PreviewFrame({ code, isIncomplete }: CustomRendererProps) {
  const { t } = useTranslation("common");

  const frameRef = usePreviewFrame(code, isIncomplete);

  return (
    <>
      <iframe
        className="block h-96 w-full border-0 bg-background"
        ref={frameRef}
        referrerPolicy="no-referrer"
        sandbox="allow-scripts"
        title={t("htmlPreview.title")}
      />
      <Text
        as="p"
        className="border-t border-chat-border-soft px-3 py-2"
        size="meta"
        tone="muted"
      >
        {t("htmlPreview.localOnly")}
      </Text>
    </>
  );
}

export function HtmlPreview(props: CustomRendererProps) {
  const { code, language, isIncomplete } = props;
  const { t } = useTranslation("common");
  const location = useAtomValue(htmlPreviewLocationAtom);
  const browserError = useBrowserPreview(
    code,
    isIncomplete,
    location === "browser",
  );

  return (
    <Tabs
      className="my-4 gap-0 overflow-hidden rounded-card border border-chat-border-soft bg-chat-code-block"
      defaultValue={location === "browser" ? "code" : "preview"}
    >
      <div className="flex min-h-9 items-center justify-between gap-2 border-b border-chat-border-soft px-2">
        <TabsList aria-label={t("htmlPreview.title")}>
          <TabsTrigger value="code">
            <Text size="meta">{t("htmlPreview.code")}</Text>
          </TabsTrigger>
          <TabsTrigger value="preview">
            <Text size="meta">{t("htmlPreview.preview")}</Text>
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center" data-streamdown="code-block-actions">
          <IconButton
            aria-label={t("htmlPreview.openInBrowser")}
            disabled={isIncomplete}
            onClick={() => openHtmlPreviewInBrowser(code)}
            size="xs"
            title={t("htmlPreview.openInBrowser")}
          >
            <Globe className="size-4" />
          </IconButton>
          <CodeBlockDownloadButton
            aria-label={t("htmlPreview.download")}
            code={code}
            language={language}
          />
          <CodeBlockCopyButton aria-label={t("actions.copyCode")} code={code} />
        </div>
      </div>
      <TabsContent className="markdown-html-source" value="code">
        <HtmlCode
          label={t("htmlPreview.code")}
          code={code}
          isIncomplete={isIncomplete}
          language={language}
        />
      </TabsContent>
      <TabsContent value="preview">
        {location === "chat" ? (
          <PreviewFrame {...props} />
        ) : (
          <Text as="p" className="px-3 py-4" size="body" tone="muted">
            {browserError || t("htmlPreview.browserLocation")}
          </Text>
        )}
      </TabsContent>
    </Tabs>
  );
}
