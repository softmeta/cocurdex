import { useAtomValue, useSetAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { PanelToolbar } from "@/app/layout/panel-toolbar";
import { AppPanelTab, FileTypeIcon } from "@/components";
import { cn } from "@/lib";
import {
  activePdfPathAtom,
  closePdfAtom,
  openPdfsAtom,
  setActivePdfAtom,
} from "./pdf-reader-store";

function getDisplayName(filePath: string) {
  const lastSep = Math.max(
    filePath.lastIndexOf("/"),
    filePath.lastIndexOf("\\"),
  );
  return lastSep >= 0 ? filePath.slice(lastSep + 1) : filePath;
}

export function PdfTabs() {
  const { t } = useTranslation("editor");
  const openPdfs = useAtomValue(openPdfsAtom);
  const activePath = useAtomValue(activePdfPathAtom);
  const setActive = useSetAtom(setActivePdfAtom);
  const closePdf = useSetAtom(closePdfAtom);

  if (openPdfs.length === 0) {
    return null;
  }

  return (
    <PanelToolbar data-testid="pdf-tabs-bar">
      <div className="scrollbar-hide flex min-w-0 flex-1 items-center gap-px overflow-x-auto">
        {openPdfs.map((filePath) => (
          <AppPanelTab
            key={filePath}
            active={filePath === activePath}
            label={getDisplayName(filePath)}
            closeLabel={t("actions.closeFile", {
              fileName: getDisplayName(filePath),
            })}
            icon={
              <FileTypeIcon
                path={filePath}
                className={cn(
                  "size-3.5 shrink-0",
                  filePath !== activePath && "opacity-60",
                )}
              />
            }
            onSelect={() => setActive(filePath)}
            onClose={() => closePdf(filePath)}
          />
        ))}
      </div>
    </PanelToolbar>
  );
}
