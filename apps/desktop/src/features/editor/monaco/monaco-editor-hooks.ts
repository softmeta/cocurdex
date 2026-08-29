import { useState } from "react";
import type { AppearanceSettings } from "@/features/settings";
import { desktopApi, useMountEffect } from "@/lib";
import {
  ensureMonacoLoaderConfigured,
  isTestEnvironment,
} from "./monaco-loader";

export function getEditorTypography(settings: AppearanceSettings) {
  return {
    fontFamily: settings.codeFontFamily || "var(--font-mono)",
    fontSize: settings.codeFontSize,
  };
}

export function useMonacoLoaderStatus() {
  const [status, setStatus] = useState<"error" | "loading" | "ready">(
    isTestEnvironment ? "ready" : "loading",
  );

  useMountEffect(() => {
    let isActive = true;

    void ensureMonacoLoaderConfigured()
      .then(() => {
        if (isActive) {
          setStatus("ready");
        }
      })
      .catch(() => {
        if (isActive) {
          setStatus("error");
        }
      });

    return () => {
      isActive = false;
    };
  });

  return status;
}

export function useMountedFileContent(
  filePath: string,
  initialContent: string | null,
  onContentLoaded: (filePath: string, content: string) => void,
) {
  const [content, setContent] = useState(initialContent ?? "");
  const [hasReadError, setHasReadError] = useState(false);

  useMountEffect(() => {
    let isActive = true;

    const load = () => {
      void desktopApi
        .readTextFile(filePath)
        .then((nextContent) => {
          if (!isActive) {
            return;
          }
          setHasReadError(false);
          setContent(nextContent);
          onContentLoaded(filePath, nextContent);
        })
        .catch(() => {
          if (isActive) {
            setHasReadError(true);
          }
        });
    };

    load();
    // Agents and external tools rewrite files on disk while a tab stays open.
    // The editor is read-only, so re-reading can never clobber local edits, and
    // main already debounces fs bursts before broadcasting.
    // ponytail: reloads on any workspace change instead of matching the changed
    // path; a single readTextFile is cheap. Narrow it if large files stutter.
    const unsubscribe = desktopApi.onWorkspaceFilesChanged(() => {
      load();
    });

    return () => {
      isActive = false;
      unsubscribe();
    };
  });

  return {
    content,
    hasCachedContent: initialContent !== null,
    hasReadError,
  };
}
