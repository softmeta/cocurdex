import { useAtomValue } from "jotai";
import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui";
import {
  activeOpenPdfPathAtom,
  PdfTabs,
  PdfViewer,
  pdfReaderRevealNonceAtom,
} from "@/features/pdf-reader";

export function PdfReaderView({
  isActive,
  onInsertTextToChat,
}: {
  isActive: boolean;
  onInsertTextToChat?(text: string): boolean;
}) {
  const { t } = useTranslation("editor");
  const filePath = useAtomValue(activeOpenPdfPathAtom);
  const revealNonce = useAtomValue(pdfReaderRevealNonceAtom);

  return (
    <>
      {/*
        Unmount tab chrome while the panel is hidden so the strip does not
        linger a frame under the next view (keep-alive only needs the viewer).
      */}
      {isActive ? <PdfTabs /> : null}
      {filePath ? (
        <PdfViewer
          key={`${revealNonce}:${filePath}`}
          filePath={filePath}
          isActive={isActive}
          onInsertTextToChat={onInsertTextToChat}
        />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-editor-canvas">
          <EmptyState
            icon={<FileText />}
            title={t("pdf.noPdfTitle")}
            description={t("pdf.noPdfDescription")}
          />
        </div>
      )}
    </>
  );
}
