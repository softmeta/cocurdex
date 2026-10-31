import { docImageUri, storedImageFileName } from "@cocurdex/shared";
import { type Editor, Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { toast } from "sonner";
import { i18n } from "@/i18n";
import { desktopApi } from "@/lib";
import {
  type DocImageRejection,
  docImageAlt,
  docImageRejection,
  imageFilesOf,
} from "./doc-image-files";

function rejectionMessage(rejection: DocImageRejection) {
  return rejection === "tooLarge"
    ? i18n.t("notes:image.tooLarge")
    : i18n.t("notes:image.unsupported");
}

async function uploadImage(file: File) {
  const rejection = docImageRejection(file);
  if (rejection) {
    toast.error(rejectionMessage(rejection));
    return null;
  }
  try {
    const stored = await desktopApi.importImageAttachment(file, file.name);
    return {
      src: docImageUri(storedImageFileName(stored.filePath)),
      alt: docImageAlt(file.name),
    };
  } catch (error) {
    toast.error(i18n.t("notes:image.uploadFailed"), {
      description: error instanceof Error ? error.message : undefined,
    });
    return null;
  }
}

async function insertImages(
  editor: Editor,
  files: File[],
  dropPosition: number | null,
) {
  let position = dropPosition;
  for (const file of files) {
    const attrs = await uploadImage(file);
    if (!attrs || editor.isDestroyed) continue;
    const at =
      position === null
        ? editor.state.selection.to
        : Math.min(position, editor.state.doc.content.size);
    editor.chain().focus().insertContentAt(at, { type: "image", attrs }).run();
    position = position === null ? null : editor.state.selection.to;
  }
}

export const DocImageUpload = Extension.create({
  name: "docImageUpload",
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey("docImageUpload"),
        props: {
          handlePaste: (_view, event) => {
            const files = imageFilesOf(event.clipboardData?.files);
            if (files.length === 0 || !editor.isEditable) return false;
            event.preventDefault();
            void insertImages(editor, files, null);
            return true;
          },
          handleDrop: (view, event, _slice, moved) => {
            if (moved || !editor.isEditable) return false;
            const files = imageFilesOf(event.dataTransfer?.files);
            if (files.length === 0) return false;
            event.preventDefault();
            const target = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            void insertImages(editor, files, target?.pos ?? null);
            return true;
          },
        },
      }),
    ];
  },
});
