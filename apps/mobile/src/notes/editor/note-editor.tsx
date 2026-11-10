import { parseDocImageUri } from "@cocurdex/shared";
import { useRouter } from "expo-router";
import {
  type ComponentRef,
  type ReactNode,
  type Ref,
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { PixelRatio, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";
import { highlightCode } from "@/files";
import { useOpenLink } from "@/markdown";
import { useTextScale } from "@/preferences";
import { type ThemeColors, useThemeColors, useThemeName } from "@/theme";
import {
  KeyboardDock,
  useHeaderOverlap,
  useKeyboardFollow,
  useOptionSheet,
} from "@/ui";
import type { NoteDocSession } from "./note-doc-session";
import {
  type NoteBlockStyle,
  type NoteCodeRequest,
  type NoteEditorCommand,
  type NoteEditorContent,
  type NoteEditorFormatState,
  type NoteEditorInbound,
  type NoteInsertKind,
  noteEditorScript,
  parseNoteEditorMessage,
} from "./note-editor-protocol";
import { NOTE_EDITOR_RUNTIME_HTML } from "./note-editor-runtime.generated";
import { NoteFormatBar } from "./note-format-bar";

type EditorWebView = ComponentRef<typeof WebView>;

export interface NoteEditorHandle {
  blur(): void;
}

export type NoteEditorBody =
  | { kind: "doc"; session: NoteDocSession }
  | { kind: "markdown"; markdown: string; onChange(markdown: string): void };

function initialContent(body: NoteEditorBody): NoteEditorContent {
  if (body.kind === "doc") return { kind: "doc", state: body.session.state() };
  return { kind: "markdown", markdown: body.markdown };
}

// The IME opens a few hundred milliseconds after focus. Hold the format bar
// until the keyboard reports in, and show it anyway after this long so a
// hardware keyboard, which sends no keyboard events, still gets it.
const FORMAT_BAR_KEYBOARD_WAIT_MS = 500;

const BLOCK_STYLES: readonly NoteBlockStyle[] = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "blockquote",
  "codeBlock",
];

type InsertChoice =
  | { name: "block"; style: NoteBlockStyle }
  | { name: "insert"; kind: NoteInsertKind };

const INSERT_CHOICES: readonly InsertChoice[] = [
  { name: "block", style: "heading1" },
  { name: "block", style: "heading2" },
  { name: "block", style: "heading3" },
  { name: "insert", kind: "bulletList" },
  { name: "insert", kind: "orderedList" },
  { name: "insert", kind: "taskList" },
  { name: "block", style: "blockquote" },
  { name: "block", style: "codeBlock" },
  { name: "insert", kind: "horizontalRule" },
  { name: "insert", kind: "table" },
];

function editorTheme(colors: ThemeColors, textScale: number) {
  return {
    colors: {
      background: colors.background,
      foreground: colors.foreground,
      "reading-text": colors.readingText,
      "muted-foreground": colors.mutedForeground,
      muted: colors.muted,
      border: colors.border,
      tint: colors.tint,
      "brand-mark": colors.brandMark,
    },
    fontScale: PixelRatio.getFontScale() * textScale,
  };
}

function insertKey(choice: InsertChoice) {
  return choice.name === "block" ? choice.style : choice.kind;
}

export function NoteEditor({
  hostId,
  body,
  title,
  meta,
  links = null,
  titlePlaceholder,
  bodyPlaceholder,
  focusTitle,
  editable,
  interactive,
  accessory,
  testID = "note-editor",
  ref,
  onTitle,
  onProperties,
  onLinks,
  onFocusChange,
}: {
  hostId: string;
  body: NoteEditorBody;
  title: string;
  meta: string | null;
  links?: string | null;
  titlePlaceholder?: string;
  bodyPlaceholder?: string;
  focusTitle: boolean;
  editable: boolean;
  interactive: boolean;
  accessory?: ReactNode;
  testID?: string;
  ref?: Ref<NoteEditorHandle>;
  onTitle(title: string): void;
  onProperties?(): void;
  onLinks?(): void;
  onFocusChange?(focused: boolean): void;
}) {
  const { t } = useTranslation("notes");
  const colors = useThemeColors();
  const scheme = useThemeName();
  const router = useRouter();
  const header = useHeaderOverlap();
  const keyboard = useKeyboardFollow(useSafeAreaInsets().bottom);
  const openLink = useOpenLink(hostId, undefined);
  const openSheet = useOptionSheet();
  const webView = useRef<EditorWebView | null>(null);
  const sentMeta = useRef(meta);
  const sentLinks = useRef(links);
  const sentEditable = useRef(editable);
  const textScale = useTextScale();
  const theme = editorTheme(colors, textScale);
  const sentTheme = useRef<string | null>(null);
  const themeKey = JSON.stringify(theme);
  const [focused, setFocused] = useState(false);
  const [keyboardWaitOver, setKeyboardWaitOver] = useState(false);
  const keyboardWait = useRef<ReturnType<typeof setTimeout> | null>(null);
  const formatBarShown = focused && (keyboard.shown || keyboardWaitOver);
  const [format, setFormat] = useState<NoteEditorFormatState | null>(null);

  const send = (message: NoteEditorInbound) =>
    webView.current?.injectJavaScript(noteEditorScript(message));
  const run = (command: NoteEditorCommand) =>
    send({ type: "command", command });
  useImperativeHandle(ref, () => ({ blur: () => run({ name: "blur" }) }));

  if (sentTheme.current !== null && sentTheme.current !== themeKey) {
    sentTheme.current = themeKey;
    send({ type: "theme", theme });
  }

  if (sentEditable.current !== editable) {
    sentEditable.current = editable;
    send({ type: "editable", editable });
  }

  if (sentLinks.current !== links) {
    sentLinks.current = links;
    send({ type: "links", links });
  }

  if (meta !== null && sentMeta.current !== meta) {
    sentMeta.current = meta;
    send({ type: "meta", meta });
  }

  const highlight = (requests: readonly NoteCodeRequest[]) => {
    for (const { id, code, language } of requests) {
      highlightCode(code, language, scheme)
        .catch(() => [])
        .then((tokens) => send({ type: "highlighted", id, tokens }));
    }
  };

  const blockLabels: Record<NoteBlockStyle, string> = {
    paragraph: t("editor.block.paragraph"),
    heading1: t("editor.block.heading1"),
    heading2: t("editor.block.heading2"),
    heading3: t("editor.block.heading3"),
    blockquote: t("editor.block.blockquote"),
    codeBlock: t("editor.block.codeBlock"),
  };
  const insertLabels: Record<NoteInsertKind, string> = {
    bulletList: t("editor.insert.bulletList"),
    orderedList: t("editor.insert.orderedList"),
    taskList: t("editor.insert.taskList"),
    horizontalRule: t("editor.insert.horizontalRule"),
    table: t("editor.insert.table"),
  };
  const insertLabel = (choice: InsertChoice) =>
    choice.name === "block"
      ? blockLabels[choice.style]
      : insertLabels[choice.kind];

  const openBlockStyles = () =>
    openSheet({
      title: t("editor.format.text"),
      items: BLOCK_STYLES.map((style) => ({
        key: style,
        label: blockLabels[style],
        selected: format?.block === style,
        testID: `note-block-${style}`,
        onPress: () => run({ name: "block", style }),
      })),
    });

  const openInsert = (fromSlash: boolean) =>
    openSheet({
      title: t("editor.format.insert"),
      items: INSERT_CHOICES.map((choice) => ({
        key: insertKey(choice),
        label: insertLabel(choice),
        testID: `note-insert-${insertKey(choice)}`,
        onPress: () => run({ ...choice, fromSlash }),
      })),
    });

  const handleMessage = ({ nativeEvent }: WebViewMessageEvent) => {
    const message = parseNoteEditorMessage(nativeEvent.data);
    if (!message) return;
    switch (message.type) {
      case "ready":
        if (focusTitle && sentEditable.current) webView.current?.requestFocus();
        sentTheme.current = themeKey;
        send({
          type: "init",
          content: initialContent(body),
          title,
          meta: sentMeta.current,
          links: sentLinks.current,
          titlePlaceholder: titlePlaceholder ?? t("editor.titlePlaceholder"),
          bodyPlaceholder: bodyPlaceholder ?? t("editor.bodyPlaceholder"),
          theme,
          focusTitle,
          editable: sentEditable.current,
          interactive,
        });
        return;
      case "update":
        if (body.kind === "doc") body.session.applyLocal(message.update);
        return;
      case "markdown":
        if (body.kind === "markdown") body.onChange(message.markdown);
        return;
      case "title":
        onTitle(message.title);
        return;
      case "focus":
        if (keyboardWait.current !== null) clearTimeout(keyboardWait.current);
        keyboardWait.current = message.focused
          ? setTimeout(
              () => setKeyboardWaitOver(true),
              FORMAT_BAR_KEYBOARD_WAIT_MS,
            )
          : null;
        if (!message.focused) setKeyboardWaitOver(false);
        setFocused(message.focused);
        onFocusChange?.(message.focused);
        return;
      case "format":
        setFormat(message.format);
        return;
      case "slash":
        openInsert(true);
        return;
      case "properties":
        onProperties?.();
        return;
      case "links":
        run({ name: "blur" });
        onLinks?.();
        return;
      case "openLink":
        openLink(message.href);
        return;
      case "highlight":
        highlight(message.requests);
        return;
      case "openImage": {
        const fileName = parseDocImageUri(message.src);
        if (!fileName) return;
        router.push({
          pathname: "/image/[hostId]",
          params: { hostId, filePath: fileName, name: message.alt || fileName },
        });
        return;
      }
    }
  };

  const session = body.kind === "doc" ? body.session : null;
  const attach = useCallback(
    (view: EditorWebView | null): (() => void) | undefined => {
      webView.current = view;
      if (!view) return undefined;
      const stopRemote = session?.onRemoteUpdate((update) =>
        view.injectJavaScript(noteEditorScript({ type: "remote", update })),
      );
      return () => {
        stopRemote?.();
        webView.current = null;
      };
    },
    [session],
  );

  const formatBar = formatBarShown ? (
    <NoteFormatBar
      format={format}
      onBlockStyle={openBlockStyles}
      onBold={() => run({ name: "mark", mark: "bold" })}
      onBulletList={() => run({ name: "list", kind: "bulletList" })}
      onTaskList={() => run({ name: "list", kind: "taskList" })}
      onInsert={() => openInsert(false)}
      onHideKeyboard={() => run({ name: "blur" })}
    />
  ) : null;
  const dock =
    accessory || formatBar ? (
      <>
        {accessory}
        {formatBar}
      </>
    ) : null;

  return (
    <View
      ref={header.ref}
      onLayout={header.onLayout}
      style={[
        styles.fill,
        {
          backgroundColor: colors.background,
          paddingTop: header.overlap,
        },
      ]}
    >
      <KeyboardDock follow={keyboard} dock={dock}>
        <WebView
          ref={attach}
          testID={testID}
          source={{ html: NOTE_EDITOR_RUNTIME_HTML }}
          originWhitelist={["about:blank"]}
          onShouldStartLoadWithRequest={({ url }) => url === "about:blank"}
          onMessage={handleMessage}
          onContentProcessDidTerminate={() => webView.current?.reload()}
          onRenderProcessGone={() => webView.current?.reload()}
          setSupportMultipleWindows={false}
          allowsLinkPreview={false}
          hideKeyboardAccessoryView
          keyboardDisplayRequiresUserAction={false}
          textZoom={100}
          style={[styles.fill, { backgroundColor: colors.background }]}
        />
      </KeyboardDock>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
