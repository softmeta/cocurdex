import { lazyComponent } from "@/lib";
import type { SkillFilePatchProps } from "./skill-file-patch";

export const SkillFilePatch = lazyComponent<SkillFilePatchProps>(
  async () => (await import("./skill-file-patch")).SkillFilePatch,
);
