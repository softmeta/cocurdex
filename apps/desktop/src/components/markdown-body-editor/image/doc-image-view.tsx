import {
  buildDaemonImageAttachmentUrl,
  parseDocImageUri,
} from "@cocurdex/shared";
import { type NodeViewProps, NodeViewWrapper } from "@tiptap/react";
import { cn, createDaemonBlobUrlStore } from "@/lib";

const useStoredImageUrl = createDaemonBlobUrlStore({
  buildUrl: buildDaemonImageAttachmentUrl,
  failureDiagnostic: "notes.docImageLoadFailed",
});

function attrText(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function DocImageView({ node, selected }: NodeViewProps) {
  const src = attrText(node.attrs.src);
  const alt = attrText(node.attrs.alt);
  const title = attrText(node.attrs.title);
  const storedFile = parseDocImageUri(src);
  const storedUrl = useStoredImageUrl(storedFile);
  const url = storedFile ? storedUrl : src;
  return (
    <NodeViewWrapper
      as="span"
      className={cn("md-body-image", selected && "is-selected")}
      data-drag-handle=""
    >
      {url ? (
        <img src={url} alt={alt} title={title || undefined} draggable={false} />
      ) : (
        <span className="md-body-image-pending" role="img" aria-label={alt} />
      )}
    </NodeViewWrapper>
  );
}
