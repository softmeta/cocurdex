import { useSetAtom } from "jotai";
import type { editor as MonacoEditorNamespace } from "monaco-editor";
import { useCallback, useEffect, useRef, useState } from "react";
import { setEditorSelectionAttachmentAtom } from "../editor-store";
import {
  getSelectionAttachment,
  getSelectionBubbleState,
  type PointerPosition,
  SELECTION_BUBBLE_DELAY_MS,
  type SelectionBubbleState,
} from "./selection-utils";

export function useSelectionBubble() {
  const setEditorSelectionAttachment = useSetAtom(
    setEditorSelectionAttachmentAtom,
  );
  const [selectionBubble, setSelectionBubble] =
    useState<SelectionBubbleState | null>(null);

  const editorRef = useRef<MonacoEditorNamespace.IStandaloneCodeEditor | null>(
    null,
  );
  const activeFileRef = useRef<string | null>(null);
  const dismissedSelectionKeyRef = useRef<string | null>(null);
  const lastSelectionKeyRef = useRef<string | null>(null);
  const pendingSelectionBubbleRef = useRef<SelectionBubbleState | null>(null);
  const selectionBubbleRef = useRef<SelectionBubbleState | null>(null);
  const selectionBubbleTimerRef = useRef<number | null>(null);
  const isPointerSelectingRef = useRef(false);
  const latestMousePositionRef = useRef<PointerPosition | null>(null);
  const syncSelectionUiRef = useRef<(() => void) | null>(null);

  selectionBubbleRef.current = selectionBubble;

  const clearSelectionBubbleTimer = useCallback(() => {
    if (selectionBubbleTimerRef.current === null) {
      return;
    }

    window.clearTimeout(selectionBubbleTimerRef.current);
    selectionBubbleTimerRef.current = null;
  }, []);

  // Sync: window mouseup to finalize pointer selection
  useEffect(() => {
    const handleWindowMouseUp = () => {
      if (!isPointerSelectingRef.current) {
        return;
      }

      isPointerSelectingRef.current = false;
      syncSelectionUiRef.current?.();
    };

    window.addEventListener("mouseup", handleWindowMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleWindowMouseUp);
    };
  }, []);

  // Cleanup timer on unmount
  useEffect(
    () => () => {
      clearSelectionBubbleTimer();
    },
    [clearSelectionBubbleTimer],
  );

  const syncSelectionUi = useCallback(() => {
    const editor = editorRef.current;
    const filePath = activeFileRef.current;

    if (!editor || !filePath) {
      clearSelectionBubbleTimer();
      pendingSelectionBubbleRef.current = null;
      setSelectionBubble(null);
      setEditorSelectionAttachment(null);
      return;
    }

    const attachment = getSelectionAttachment(editor, filePath);

    if (!attachment) {
      clearSelectionBubbleTimer();
      dismissedSelectionKeyRef.current = null;
      lastSelectionKeyRef.current = null;
      pendingSelectionBubbleRef.current = null;
      setSelectionBubble(null);
      setEditorSelectionAttachment(null);
      return;
    }

    setEditorSelectionAttachment(attachment);

    const nextSelectionBubble = getSelectionBubbleState(
      editor,
      attachment,
      latestMousePositionRef.current,
    );

    if (!nextSelectionBubble) {
      clearSelectionBubbleTimer();
      pendingSelectionBubbleRef.current = null;
      setSelectionBubble(null);
      return;
    }

    const selectionKey = nextSelectionBubble.selectionKey;
    const hasSelectionChanged = lastSelectionKeyRef.current !== selectionKey;

    if (hasSelectionChanged) {
      dismissedSelectionKeyRef.current = null;
      lastSelectionKeyRef.current = selectionKey;
    }

    pendingSelectionBubbleRef.current = nextSelectionBubble;

    if (isPointerSelectingRef.current) {
      clearSelectionBubbleTimer();
      setSelectionBubble(null);
      return;
    }

    if (dismissedSelectionKeyRef.current === selectionKey) {
      clearSelectionBubbleTimer();
      setSelectionBubble(null);
      return;
    }

    if (!hasSelectionChanged && selectionBubbleRef.current) {
      setSelectionBubble(nextSelectionBubble);
      return;
    }

    clearSelectionBubbleTimer();
    setSelectionBubble(null);
    selectionBubbleTimerRef.current = window.setTimeout(() => {
      selectionBubbleTimerRef.current = null;

      if (dismissedSelectionKeyRef.current === selectionKey) {
        return;
      }

      if (lastSelectionKeyRef.current !== selectionKey) {
        return;
      }

      setSelectionBubble(pendingSelectionBubbleRef.current);
    }, SELECTION_BUBBLE_DELAY_MS);
  }, [clearSelectionBubbleTimer, setEditorSelectionAttachment]);

  syncSelectionUiRef.current = syncSelectionUi;

  const resetSelectionState = useCallback(() => {
    clearSelectionBubbleTimer();
    dismissedSelectionKeyRef.current = null;
    lastSelectionKeyRef.current = null;
    pendingSelectionBubbleRef.current = null;
    setSelectionBubble(null);
    setEditorSelectionAttachment(null);
  }, [clearSelectionBubbleTimer, setEditorSelectionAttachment]);

  const dismissBubble = useCallback(
    (selectionKey: string) => {
      dismissedSelectionKeyRef.current = selectionKey;
      clearSelectionBubbleTimer();
      setSelectionBubble(null);
    },
    [clearSelectionBubbleTimer],
  );

  const handleEditorMouseDown = useCallback(
    (event: { event: { browserEvent: MouseEvent } }) => {
      isPointerSelectingRef.current = true;
      latestMousePositionRef.current = {
        clientX: event.event.browserEvent.clientX,
        clientY: event.event.browserEvent.clientY,
      };
      clearSelectionBubbleTimer();
      setSelectionBubble(null);
    },
    [clearSelectionBubbleTimer],
  );

  const handleEditorMouseUp = useCallback(
    (event: { event: { browserEvent: MouseEvent } }) => {
      latestMousePositionRef.current = {
        clientX: event.event.browserEvent.clientX,
        clientY: event.event.browserEvent.clientY,
      };
      isPointerSelectingRef.current = false;
      syncSelectionUiRef.current?.();
    },
    [],
  );

  return {
    selectionBubble,
    editorRef,
    activeFileRef,
    syncSelectionUiRef,
    syncSelectionUi,
    clearSelectionBubbleTimer,
    resetSelectionState,
    dismissBubble,
    handleEditorMouseDown,
    handleEditorMouseUp,
  };
}
