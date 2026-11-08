import { getBuiltInSpriteSheet } from "@pierre/trees";
import { Folder, FolderOpen } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { getFileTypeIconAttributes } from "./file-type-icon-markup";

export interface FileTypeIconProps {
  className?: string;
  expanded?: boolean;
  isFolder?: boolean;
  path: string;
}

export function FileTypeIcon({
  className,
  expanded = false,
  isFolder = false,
  path,
}: FileTypeIconProps) {
  if (isFolder) {
    const Icon = expanded ? FolderOpen : Folder;
    return <Icon aria-hidden className={cn("size-3.5", className)} />;
  }

  const { symbolId, color } = getFileTypeIconAttributes(path);
  return (
    <svg
      aria-hidden="true"
      className={cn("size-3.5", className)}
      role="img"
      style={color ? ({ color } as CSSProperties) : undefined}
      viewBox="0 0 16 16"
    >
      <use href={`#${symbolId}`} />
    </svg>
  );
}

let cachedSprite: string | null = null;

function getSprite(): string {
  if (cachedSprite === null) {
    cachedSprite = getBuiltInSpriteSheet("complete");
  }
  return cachedSprite;
}

export function FileTypeIconSprite() {
  return (
    <span
      aria-hidden="true"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted library-provided sprite markup
      dangerouslySetInnerHTML={{ __html: getSprite() }}
      style={{ display: "none" }}
    />
  );
}
