import { AppShell } from "@/app/layout";
import { FileTypeIconSprite } from "@/components";
import { Toaster } from "@/components/ui";

export function App() {
  return (
    <>
      {/* Light-DOM glyph sprite shared by every file-type icon (tabs,
          breadcrumb, search, file palette, chat mention pills). Mounted once
          at the app root so the `<use href="#…">` references always resolve,
          even while the editor panel is collapsed. */}
      <FileTypeIconSprite />
      <AppShell />
      <Toaster />
    </>
  );
}
