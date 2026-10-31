import {
  getFiletypeFromFileName,
  getHighlighterIfLoaded,
  preloadHighlighter,
} from "@pierre/diffs";
import { PatchDiff } from "@pierre/diffs/react";
import { useEffect, useState } from "react";
import { useResolvedTheme } from "@/lib";

const DIFF_THEMES = { dark: "pierre-dark", light: "pierre-light" } as const;

function useHighlighterReady(path: string) {
  const language = getFiletypeFromFileName(path);
  const [ready, setReady] = useState(
    () =>
      getHighlighterIfLoaded({ theme: DIFF_THEMES, lang: language }) !==
      undefined,
  );
  useEffect(() => {
    if (ready) return;
    let active = true;
    void preloadHighlighter({
      themes: [DIFF_THEMES.dark, DIFF_THEMES.light],
      langs: [language],
      preferredHighlighter: "highlights",
    }).then(() => {
      if (active) setReady(true);
    });
    return () => {
      active = false;
    };
  }, [language, ready]);
  return ready;
}

export interface SkillFilePatchProps {
  path: string;
  patch: string;
}

export function SkillFilePatch({ path, patch }: SkillFilePatchProps) {
  const ready = useHighlighterReady(path);
  const resolvedTheme = useResolvedTheme();
  if (!ready) {
    return null;
  }
  return (
    <PatchDiff
      disableWorkerPool
      options={{
        diffStyle: "unified",
        disableFileHeader: true,
        hunkSeparators: "line-info-basic",
        overflow: "wrap",
        preferredHighlighter: "highlights",
        theme: DIFF_THEMES,
        themeType: resolvedTheme === "light" ? "light" : "dark",
      }}
      patch={patch}
      style={{ display: "block", minWidth: "100%" }}
    />
  );
}
