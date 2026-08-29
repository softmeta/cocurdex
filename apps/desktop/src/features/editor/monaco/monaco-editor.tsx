import type { MessageAttachment } from "@cocurdex/shared";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import { useAtomValue, useSetAtom } from "jotai";
import { ArrowUpLeft, FileText } from "lucide-react";
import type { editor as MonacoEditorNamespace } from "monaco-editor";
import { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MarkdownRenderer } from "@/components";
import { Button } from "@/components/ui";
// Leaf imports (not the pdf-reader barrel) to avoid an editor ↔ pdf-reader
// barrel cycle: the barrel re-exports PdfViewer, which imports the editor barrel.
import { isPdfPath } from "@/features/pdf-reader/is-pdf-path";
import { openPdfReaderAtom } from "@/features/pdf-reader/pdf-reader-store";
import type { AppearanceSettings } from "@/features/settings";
import { activeWorkspaceIdAtom } from "@/features/workspaces";
import {
  activeFileAtom,
  type EditorPreviewLocation,
  editorRevealNonceAtom,
  markdownPreviewModeAtom,
  previewLocationsByFileAtom,
} from "../editor-store";
import "./monaco-editor.css";
import { useResolvedTheme } from "@/lib";
import { useSelectionBubble } from "../selection";
import { MONACO_EDITOR_OPTIONS } from "./monaco-editor-config";
import {
  getEditorTypography,
  useMonacoLoaderStatus,
  useMountedFileContent,
} from "./monaco-editor-hooks";
import { getEditorHighlighter } from "./monaco-loader";
import {
  applyEditorTheme,
  EDITOR_SHIKI_THEMES,
  getEditorThemeName,
} from "./monaco-theme";
import {
  getEditorLanguage,
  revealPreviewLine,
  syncPreviewRange,
} from "./monaco-utils";

interface MonacoEditorProps {
  appearanceSettings: AppearanceSettings;
  onAddSelectionToChat?(attachment: MessageAttachment): void;
}

const ADD_TO_CHAT_SHORTCUT_LABEL = "⌘L";

interface MonacoTextEditorProps {
  activeFile: string;
  activePreviewLocation: EditorPreviewLocation | null;
  cachedContent: string | null;
  editorRef: ReturnType<typeof useSelectionBubble>["editorRef"];
  editorRevealNonce: number;
  editorThemeName: ReturnType<typeof getEditorThemeName>;
  handleEditorMouseDown: ReturnType<
    typeof useSelectionBubble
  >["handleEditorMouseDown"];
  handleEditorMouseUp: ReturnType<
    typeof useSelectionBubble
  >["handleEditorMouseUp"];
  isPreviewMode: boolean;
  onContentLoaded(filePath: string, content: string): void;
  readErrorFallback: ReactNode;
  resetSelectionState: ReturnType<
    typeof useSelectionBubble
  >["resetSelectionState"];
  syncSelectionUiRef: ReturnType<
    typeof useSelectionBubble
  >["syncSelectionUiRef"];
  /** Color pack id — remounts chrome when the pack changes without light/dark flip. */
  themePreset: AppearanceSettings["themePreset"];
  typography: ReturnType<typeof getEditorTypography>;
}

function MonacoTextEditor({
  activeFile,
  activePreviewLocation,
  cachedContent,
  editorRef,
  editorRevealNonce,
  editorThemeName,
  handleEditorMouseDown,
  handleEditorMouseUp,
  isPreviewMode,
  onContentLoaded,
  readErrorFallback,
  resetSelectionState,
  syncSelectionUiRef,
  themePreset,
  typography,
}: MonacoTextEditorProps) {
  const decorationCollectionRef =
    useRef<MonacoEditorNamespace.IEditorDecorationsCollection | null>(null);
  const { content, hasCachedContent, hasReadError } = useMountedFileContent(
    activeFile,
    cachedContent,
    onContentLoaded,
  );
  const editorOptions = useMemo(
    () => ({
      ...MONACO_EDITOR_OPTIONS,
      fontFamily: typography.fontFamily,
      fontSize: typography.fontSize,
    }),
    [typography.fontFamily, typography.fontSize],
  );
  // themePreset is part of the key so chrome colors re-bind when the user
  // switches color packs without flipping light/dark (Monaco themes snapshot
  // CSS variables at defineTheme time).
  const editorKey = [
    activeFile,
    activePreviewLocation?.startLine ?? "",
    activePreviewLocation?.endLine ?? "",
    editorRevealNonce,
    editorThemeName,
    themePreset,
  ].join(":");

  const applyAvailableThemes = useCallback((monaco: Monaco) => {
    const highlighter = getEditorHighlighter();
    if (!highlighter) {
      return;
    }

    applyEditorTheme(monaco, highlighter, EDITOR_SHIKI_THEMES.dark);
    applyEditorTheme(monaco, highlighter, EDITOR_SHIKI_THEMES.light);
  }, []);

  const handleBeforeMount = useCallback(
    (monaco: Monaco) => {
      applyAvailableThemes(monaco);
    },
    [applyAvailableThemes],
  );

  const handleEditorMount = useCallback<OnMount>(
    (editor, monaco) => {
      editorRef.current = editor;
      applyAvailableThemes(monaco);
      monaco.editor.setTheme(editorThemeName);
      decorationCollectionRef.current = editor.createDecorationsCollection();

      if (activePreviewLocation?.startLine) {
        syncPreviewRange(
          editor,
          decorationCollectionRef.current,
          activePreviewLocation.startLine,
          activePreviewLocation.endLine,
        );
        const startLine = activePreviewLocation.startLine;
        requestAnimationFrame(() => revealPreviewLine(editor, startLine));
      }

      const selectionSubscription = editor.onDidChangeCursorSelection(() => {
        syncSelectionUiRef.current?.();
      });
      const mouseDownSubscription = editor.onMouseDown((event) => {
        handleEditorMouseDown(event);
      });
      const mouseUpSubscription = editor.onMouseUp((event) => {
        handleEditorMouseUp(event);
      });
      const scrollSubscription = editor.onDidScrollChange(() => {
        syncSelectionUiRef.current?.();
      });
      const layoutSubscription = editor.onDidLayoutChange(() => {
        syncSelectionUiRef.current?.();
      });
      const blurSubscription = editor.onDidBlurEditorText(() => {
        window.setTimeout(() => {
          syncSelectionUiRef.current?.();
        }, 0);
      });

      syncSelectionUiRef.current?.();

      return () => {
        selectionSubscription.dispose();
        mouseDownSubscription.dispose();
        mouseUpSubscription.dispose();
        scrollSubscription.dispose();
        layoutSubscription.dispose();
        blurSubscription.dispose();
        editorRef.current = null;
        resetSelectionState();
      };
    },
    [
      activePreviewLocation,
      applyAvailableThemes,
      editorRef,
      editorThemeName,
      handleEditorMouseDown,
      handleEditorMouseUp,
      resetSelectionState,
      syncSelectionUiRef,
    ],
  );

  if (hasReadError && !hasCachedContent) {
    return readErrorFallback;
  }

  if (isPreviewMode) {
    return (
      <div className="h-full overflow-auto p-6">
        <MarkdownRenderer
          content={content}
          tone="editor"
          className="space-y-4"
        />
      </div>
    );
  }

  return (
    <Editor
      beforeMount={handleBeforeMount}
      height="100%"
      key={editorKey}
      language={getEditorLanguage(activeFile)}
      loading={null}
      onMount={handleEditorMount}
      options={editorOptions}
      path={activeFile}
      theme={editorThemeName}
      value={content}
    />
  );
}

export function MonacoEditor({
  appearanceSettings,
  onAddSelectionToChat,
}: MonacoEditorProps) {
  const { t } = useTranslation("editor");
  const activeFile = useAtomValue(activeFileAtom);
  const activeWorkspaceId = useAtomValue(activeWorkspaceIdAtom);
  // PDFs are read in the dedicated PDF reader tab, never in Monaco. A `.pdf` can
  // still reach here via a legacy/persisted editor tab, so guard against
  // reading or rendering its raw bytes as text.
  const isActivePdf = activeFile !== null && isPdfPath(activeFile);
  const openPdfReader = useSetAtom(openPdfReaderAtom);
  const previewLocationsByFile = useAtomValue(previewLocationsByFileAtom);
  const isPreviewMode = useAtomValue(markdownPreviewModeAtom);
  const activePreviewLocation = activeFile
    ? (previewLocationsByFile[activeFile] ?? null)
    : null;
  // Bumped on every explicit open, so re-opening the same path:line re-scrolls
  // even when the preview location is unchanged.
  const editorRevealNonce = useAtomValue(editorRevealNonceAtom);
  const [contentByFile, setContentByFile] = useState<Record<string, string>>(
    {},
  );
  const {
    selectionBubble,
    editorRef,
    activeFileRef,
    syncSelectionUiRef,
    resetSelectionState,
    dismissBubble,
    handleEditorMouseDown,
    handleEditorMouseUp,
  } = useSelectionBubble();
  const monacoLoaderStatus = useMonacoLoaderStatus();
  const typography = useMemo(
    () => getEditorTypography(appearanceSettings),
    [appearanceSettings],
  );

  // Single source of truth for the editor theme: the shared hook tracks the
  // document `data-theme` attribute that app-shell keeps in sync with the
  // resolved app theme. Deriving the Monaco theme name here keeps mount,
  // theme registration, and live updates reading from one value.
  const resolvedTheme = useResolvedTheme();
  const editorThemeName = getEditorThemeName(resolvedTheme);

  activeFileRef.current = activeFile;
  const handleContentLoaded = useCallback(
    (filePath: string, content: string) => {
      setContentByFile((prev) =>
        prev[filePath] === content ? prev : { ...prev, [filePath]: content },
      );
    },
    [],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 bg-editor-monaco-bg">
        {!activeFile ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="max-w-sm space-y-2 px-6">
              <p className="text-sm text-editor-fg">
                {activeWorkspaceId
                  ? t("states.noFileSelected")
                  : t("states.noWorkspaceTitle")}
              </p>
              <p className="text-xs leading-5 text-editor-fg-muted">
                {activeWorkspaceId
                  ? t("states.noFileDescription")
                  : t("states.noWorkspaceEditorDescription")}
              </p>
            </div>
          </div>
        ) : isActivePdf ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="flex max-w-sm flex-col items-center gap-3 px-6">
              <FileText className="size-6 text-editor-fg-muted" />
              <div className="space-y-2">
                <p className="text-sm text-editor-fg">
                  {t("pdf.editorHintTitle")}
                </p>
                <p className="text-xs leading-5 text-editor-fg-muted">
                  {t("pdf.editorHintDescription")}
                </p>
              </div>
              {activeFile ? (
                <Button
                  size="sm"
                  type="button"
                  variant="outline"
                  onClick={() => openPdfReader(activeFile)}
                >
                  <FileText className="size-3.5" />
                  {t("pdf.openInReaderAction")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : monacoLoaderStatus === "error" ? (
          <div className="flex h-full items-center justify-center text-center">
            <p className="text-xs text-editor-fg-muted">
              {t("states.fileReadError")}
            </p>
          </div>
        ) : monacoLoaderStatus !== "ready" ? (
          // Blank canvas while the Monaco loader initializes — no loading text.
          <div className="h-full" />
        ) : (
          <div className="relative h-full">
            <MonacoTextEditor
              activeFile={activeFile}
              activePreviewLocation={activePreviewLocation}
              cachedContent={contentByFile[activeFile] ?? null}
              editorRef={editorRef}
              editorRevealNonce={editorRevealNonce}
              editorThemeName={editorThemeName}
              handleEditorMouseDown={handleEditorMouseDown}
              handleEditorMouseUp={handleEditorMouseUp}
              isPreviewMode={isPreviewMode}
              key={activeFile}
              onContentLoaded={handleContentLoaded}
              readErrorFallback={
                <div className="flex h-full items-center justify-center text-center">
                  <p className="text-xs text-editor-fg-muted">
                    {t("states.fileReadError")}
                  </p>
                </div>
              }
              resetSelectionState={resetSelectionState}
              syncSelectionUiRef={syncSelectionUiRef}
              themePreset={appearanceSettings.themePreset}
              typography={typography}
            />
            {!isPreviewMode && selectionBubble ? (
              <button
                className="agents-selection-bubble-enter absolute z-20 flex items-center gap-1.5 whitespace-nowrap rounded-control border border-white/10 bg-black/80 py-1.5 ps-2 pe-1.5 text-xs font-medium text-white shadow-lg shadow-black/30 backdrop-blur-md transition-colors hover:bg-black/90"
                onClick={() => {
                  dismissBubble(selectionBubble.selectionKey);
                  onAddSelectionToChat?.(selectionBubble.attachment);
                }}
                key={selectionBubble.selectionKey}
                onMouseDown={(event) => event.preventDefault()}
                style={{
                  left: selectionBubble.left,
                  top: selectionBubble.top,
                }}
                type="button"
              >
                <ArrowUpLeft className="size-3.5 text-white/70" />
                {t("actions.addToChat")}
                <kbd className="rounded border border-white/15 bg-white/10 px-1 py-0.5 font-sans text-2xs text-white/55">
                  {ADD_TO_CHAT_SHORTCUT_LABEL}
                </kbd>
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
