import { lazyComponent } from "@/lib";
import type { AcpRegistryDialogProps } from "./acp-registry-dialog";

export const AcpRegistryDialog = lazyComponent<AcpRegistryDialogProps>(
  async () => (await import("./acp-registry-dialog")).AcpRegistryDialog,
);
