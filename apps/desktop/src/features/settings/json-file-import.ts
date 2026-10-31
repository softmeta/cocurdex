import { type DragEvent, useRef, useState } from "react";
import { toast } from "sonner";
import { isJsonImportFile } from "./import-json-file";

export type JsonTextHandler = (
  text: string,
) => Promise<string | null> | string | null;

function dataTransferHasFiles(dataTransfer: DataTransfer | null): boolean {
  if (!dataTransfer) {
    return false;
  }
  return Array.from(dataTransfer.types).includes("Files");
}

export function useJsonFileImport({
  invalidFileMessage,
  onText,
}: {
  invalidFileMessage: string;
  onText: JsonTextHandler;
}) {
  async function importFile(file: File | undefined) {
    if (!file) {
      return;
    }
    if (!isJsonImportFile(file)) {
      toast.error(invalidFileMessage);
      return;
    }
    const error = await onText(await file.text());
    if (error) {
      toast.error(error);
    }
  }

  function importFiles(files: File[]) {
    void importFile(
      files.find((candidate) => isJsonImportFile(candidate)) ?? files[0],
    );
  }

  return { importFile, importFiles };
}

export function useFileDropTarget(onFiles: (files: File[]) => void) {
  const dragDepthRef = useRef(0);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  function onDragEnter(event: DragEvent<HTMLElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current += 1;
    setIsDraggingFile(true);
  }

  function onDragLeave(event: DragEvent<HTMLElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDraggingFile(false);
    }
  }

  function onDragOver(event: DragEvent<HTMLElement>) {
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "copy";
  }

  function onDrop(event: DragEvent<HTMLElement>) {
    dragDepthRef.current = 0;
    setIsDraggingFile(false);
    if (!dataTransferHasFiles(event.dataTransfer)) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    onFiles(Array.from(event.dataTransfer.files));
  }

  return {
    isDraggingFile,
    dropHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop },
  };
}
