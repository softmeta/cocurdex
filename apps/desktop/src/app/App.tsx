import { AppShell } from "@/app/layout";
import { FileTypeIconSprite } from "@/components";
import { Toaster } from "@/components/ui";
import { UpdateReadyCard } from "@/features/app-update";
import { HostDirectoryPickerHost } from "@/features/workspaces";

export function App() {
  return (
    <>
      <FileTypeIconSprite />
      <AppShell />
      <Toaster />
      <UpdateReadyCard />
      <HostDirectoryPickerHost />
    </>
  );
}
