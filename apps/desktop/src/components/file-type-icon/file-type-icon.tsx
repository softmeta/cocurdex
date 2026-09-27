import { getBuiltInSpriteSheet } from "@pierre/trees";
import { Folder, FolderOpen } from "lucide-react";
import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { getFileTypeIconAttributes } from "./file-type-icon-markup";

/**
 * Brand-aware file-type icons backed by the same `@pierre/trees` glyph set the
 * file tree renders, so tabs, breadcrumbs, search results, the file palette,
 * and chat mention pills all show identical icons (framework logos included).
 *
 * Folders are not part of the glyph set — pierre's built-in tokens are file
 * types only — so they fall back to Lucide's `Folder` / `FolderOpen` outlines
 * in `currentColor`.
 */

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
    // Inherit currentColor so editor vs chat hosts can set their own muted /
    // folder tokens via className; do not pin a chat-only color here.
    const Icon = expanded ? FolderOpen : Folder;
    return <Icon aria-hidden className={cn("size-3.5", className)} />;
  }

  const { symbolId, color } = getFileTypeIconAttributes(path);
  return (
    <svg
      aria-hidden="true"
      // Default size-3.5 matches editor chrome (tabs, breadcrumb, search) and
      // Pierre tree --trees-icon-width-override (14px).
      className={cn("size-3.5", className)}
      role="img"
      // Built-in glyphs are authored on a 16×16 grid; the referenced symbol
      // carries the same viewBox so `<use>` scales to the svg's CSS size.
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

/**
 * Hidden sprite holding every built-in glyph, injected once into light DOM so
 * the `<use href="#…">` references (React `FileTypeIcon` and the imperative
 * mention pills) resolve. The file tree keeps its own copy inside its shadow
 * root, so the two never collide. Render exactly one instance at the app root.
 */
export function FileTypeIconSprite() {
  return (
    <span
      aria-hidden="true"
      // The sprite is a trusted constant string bundled with `@pierre/trees`.
      // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted library-provided sprite markup
      dangerouslySetInnerHTML={{ __html: getSprite() }}
      style={{ display: "none" }}
    />
  );
}
